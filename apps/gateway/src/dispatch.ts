import { logger } from "@viktor/config";
import { createRun, ensureThread } from "@viktor/db";
import {
  type AgentRunJob,
  enqueue,
  queue,
  type RunTrigger,
  type SlackFileRef,
} from "@viktor/queue";

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
  // Slack redelivers events it thinks were missed; the message ts makes dispatch idempotent.
  const jobId = `${msg.workspaceId}-${msg.channelId}-${msg.messageTs}`;
  if (await queue("agent-run").getJob(jobId)) return;

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
  await enqueue("agent-run", job, { jobId, attempts: 1 });
  logger.info({ runId: run.id, workspaceId: msg.workspaceId, trigger: msg.trigger }, "run queued");
}
