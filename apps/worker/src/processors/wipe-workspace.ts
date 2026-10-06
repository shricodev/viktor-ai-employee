import { deleteTrigger, forgetSession } from "@viktor/composio";
import { logger } from "@viktor/config";
import { getWorkspace, wipeWorkspaceData } from "@viktor/db";
import { removeDailyCheckin, removeSchedule, type WipeWorkspaceJob } from "@viktor/queue";
import { destroySandbox } from "@viktor/sandbox";
import { slackFor } from "@viktor/slack";
import type { Job } from "bullmq";

export async function processWipeWorkspace(job: Job<WipeWorkspaceJob>): Promise<void> {
  const { workspaceId, requestedBy } = job.data;
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return;

  const result = await wipeWorkspaceData(workspaceId);
  await Promise.allSettled([
    ...result.scheduleIds.map((id) => removeSchedule(id)),
    ...result.composioTriggerIds.map((id) => deleteTrigger(id)),
    removeDailyCheckin(workspaceId),
    destroySandbox(workspaceId),
  ]);
  forgetSession(workspaceId);
  logger.info({ workspaceId, requestedBy, ...result }, "workspace wiped");

  const slack = await slackFor(workspaceId);
  const dm = await slack.conversations.open({ users: requestedBy });
  if (dm.channel?.id) {
    await slack.chat.postMessage({
      channel: dm.channel.id,
      text: `Done. I deleted ${result.memories} memories, ${result.skills} skills, ${result.scheduleIds.length} schedules, ${result.composioTriggerIds.length} triggers, conversation history for ${result.threads} threads, and my computer's files. App connections were kept; disconnect them in Composio if you want those gone too.`,
    });
  }
}
