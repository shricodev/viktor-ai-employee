import { logger } from "@viktor/config";
import {
  createRun,
  ensureThread,
  getWorkspace,
  listSchedules,
  pendingApprovals,
  recentRuns,
  workspacesWithCheckin,
} from "@viktor/db";
import { type DailyCheckinJob, removeDailyCheckin, upsertDailyCheckin } from "@viktor/queue";
import { slackFor, titleCase } from "@viktor/slack";
import type { Job } from "bullmq";
import { postRoot } from "../post-root.ts";
import { runLockedTurn } from "../turn.ts";

const PROMPT = `Morning check-in. Using the activity summary and anything quick you can check in the team's connected apps, write a short briefing:
1. What needs attention today (failed runs, pending approvals, follow-ups you know about).
2. Up to three concrete things you could take off the team's plate, phrased as offers.
Stay under 150 words. If nothing is worth raising, say in one line that all is quiet.`;

export async function processDailyCheckin(job: Job<DailyCheckinJob>): Promise<void> {
  const workspace = await getWorkspace(job.data.workspaceId);
  const channelId = workspace?.settings.checkinChannelId;
  if (!workspace || workspace.uninstalledAt || !channelId) {
    await removeDailyCheckin(job.data.workspaceId);
    return;
  }

  const since = new Date(Date.now() - 24 * 3600_000);
  const [runs, approvals, schedules] = await Promise.all([
    recentRuns(workspace.id, since),
    pendingApprovals(workspace.id),
    listSchedules(workspace.id),
  ]);
  const failed = runs.filter((r) => r.status === "failed");
  const summary = [
    `Runs in the last 24h: ${runs.length} (${failed.length} failed)`,
    ...failed
      .slice(0, 5)
      .map(
        (r) =>
          `- failed ${r.trigger} run: "${r.prompt.slice(0, 120)}" (${r.error ?? "unknown error"})`,
      ),
    `Pending approvals: ${approvals.length}`,
    ...approvals
      .slice(0, 5)
      .map((a) => `- ${a.actions.map(titleCase).join(", ")} in <#${a.channelId}>`),
    `Active schedules: ${
      schedules
        .filter((s) => s.enabled)
        .map((s) => s.name)
        .join(", ") || "none"
    }`,
  ].join("\n");

  const slack = await slackFor(workspace.id);
  const threadTs = await postRoot(slack, channelId, ":sunny: Daily check-in", [
    { type: "section", text: { type: "mrkdwn", text: ":sunny: *Daily check-in*" } },
  ]);
  const thread = await ensureThread({ workspaceId: workspace.id, channelId, threadTs });
  const run = await createRun({
    workspaceId: workspace.id,
    threadId: thread.id,
    trigger: "proactive",
    prompt: PROMPT,
  });
  await runLockedTurn({
    run,
    workspace,
    channelId,
    threadTs,
    text: PROMPT,
    trigger: "proactive",
    extraSections: [{ title: "Activity summary", body: summary }],
  });
}

export async function reconcileCheckins(): Promise<number> {
  const all = await workspacesWithCheckin();
  for (const ws of all) {
    await upsertDailyCheckin(ws.id, ws.timezone).catch((err) =>
      logger.warn({ err, workspaceId: ws.id }, "failed to register daily check-in"),
    );
  }
  return all.length;
}
