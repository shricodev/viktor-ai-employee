import { logger } from "@viktor/config";
import { createRun, ensureThread } from "@viktor/db";
import { type AgentRunJob, enqueue, type RunTrigger, type SlackFileRef } from "@viktor/queue";

export type Incoming = {
  workspaceId: string;
  channelId: string;
  threadTs: string;
  messageTs: string;
  userId: string;
  text: string;
  trigger: RunTrigger;
  files?: SlackFileRef[];
};

export async function dispatchRun(msg: Incoming): Promise<void> {
  const thread = await ensureThread({
    workspaceId: msg.workspaceId,
    channelId: msg.channelId,
    threadTs: msg.threadTs,
  });
  const run = await createRun({
    workspaceId: msg.workspaceId,
    threadId: thread.id,
    trigger: msg.trigger,
    requestedBy: msg.userId,
    prompt: msg.text,
  });
  const job: AgentRunJob = { runId: run.id, ...msg };
  // Slack redelivers events on slow acks; the message ts makes the job idempotent.
  await enqueue("agent-run", job, {
    jobId: `${msg.workspaceId}-${msg.channelId}-${msg.messageTs}`,
    attempts: 1,
  });
  logger.info({ runId: run.id, workspaceId: msg.workspaceId, trigger: msg.trigger }, "run queued");
}
