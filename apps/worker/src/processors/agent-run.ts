import { env, logger } from "@viktor/config";
import { getRun, getWorkspace } from "@viktor/db";
import type { AgentRunJob } from "@viktor/queue";
import { slackFor } from "@viktor/slack";
import { DelayedError, type Job } from "bullmq";
import { threadLockKey, tryLock } from "../lock.ts";
import { runTurn } from "../turn.ts";

export async function processAgentRun(job: Job<AgentRunJob>, token?: string): Promise<void> {
  const data = job.data;
  const release = await tryLock(
    threadLockKey(data.workspaceId, data.channelId, data.threadTs),
    env().AGENT_TIMEOUT_MS + 5 * 60_000,
  );
  if (!release) {
    // One run per thread at a time; later messages wait their turn.
    await job.moveToDelayed(Date.now() + 3_000, token);
    throw new DelayedError();
  }

  try {
    const [run, workspace] = await Promise.all([
      getRun(data.runId),
      getWorkspace(data.workspaceId),
    ]);
    if (!run || !workspace || workspace.uninstalledAt) {
      logger.warn({ runId: data.runId }, "run or workspace missing, skipping");
      return;
    }
    await runTurn({ ...data, run, workspace });
  } finally {
    await release();
    if (data.messageTs) {
      const slack = await slackFor(data.workspaceId).catch(() => undefined);
      await slack?.reactions
        .remove({ channel: data.channelId, timestamp: data.messageTs, name: "eyes" })
        .catch(() => undefined);
    }
  }
}
