import { logger } from "@viktor/config";
import {
  createRun,
  ensureThread,
  getSchedule,
  getWorkspace,
  listEnabledSchedules,
  markScheduleRan,
} from "@viktor/db";
import { removeSchedule, type ScheduledRunJob, upsertSchedule } from "@viktor/queue";
import { slackFor } from "@viktor/slack";
import type { Job } from "bullmq";
import { tryLock } from "../lock.ts";
import { postRoot } from "../post-root.ts";
import { runTurn } from "../turn.ts";

export async function processScheduledRun(job: Job<ScheduledRunJob>): Promise<void> {
  const { scheduleId } = job.data;
  const schedule = await getSchedule(scheduleId);
  if (!schedule || !schedule.enabled) {
    await removeSchedule(scheduleId);
    return;
  }
  const workspace = await getWorkspace(schedule.workspaceId);
  if (!workspace || workspace.uninstalledAt) {
    await removeSchedule(scheduleId);
    return;
  }

  const release = await tryLock(`schedule:${scheduleId}`, 60 * 60_000);
  if (!release) {
    logger.warn({ scheduleId }, "previous run of this schedule is still going, skipping");
    return;
  }

  try {
    const slack = await slackFor(workspace.id);
    const threadTs = await postRoot(slack, schedule.channelId, `:calendar: ${schedule.name}`, [
      { type: "section", text: { type: "mrkdwn", text: `:calendar: *${schedule.name}*` } },
      { type: "context", elements: [{ type: "mrkdwn", text: "Scheduled run" }] },
    ]);
    const thread = await ensureThread({
      workspaceId: workspace.id,
      channelId: schedule.channelId,
      threadTs,
    });
    const run = await createRun({
      workspaceId: workspace.id,
      threadId: thread.id,
      trigger: "schedule",
      requestedBy: schedule.createdBy,
      prompt: schedule.prompt,
    });
    await runTurn({
      run,
      workspace,
      channelId: schedule.channelId,
      threadTs,
      userId: schedule.createdBy ?? undefined,
      text: schedule.prompt,
      trigger: "schedule",
      extraSections: [
        {
          title: "Scheduled run",
          body: `This is the recurring schedule "${schedule.name}" (${schedule.cron}, ${schedule.timezone}), set up by ${schedule.createdBy ? `<@${schedule.createdBy}>` : "a teammate"}. Nobody is waiting live; post a complete, skimmable result.`,
        },
      ],
    });
    await markScheduleRan(schedule.id);
  } finally {
    await release();
  }
}

/** Re-registers every enabled schedule so a Redis reset never silently drops one. */
export async function reconcileSchedules(): Promise<number> {
  const all = await listEnabledSchedules();
  for (const s of all) await upsertSchedule({ id: s.id, cron: s.cron, timezone: s.timezone });
  return all.length;
}
