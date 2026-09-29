import { buildSystemPrompt, buildTurnContext, runAgent } from "@viktor/agent";
import { env, logger } from "@viktor/config";
import {
  finishRun,
  getRun,
  getThread,
  getWorkspace,
  recordThreadCost,
  setThreadSession,
  spendSince,
  startRun,
} from "@viktor/db";
import type { AgentRunJob } from "@viktor/queue";
import { describeTool, ProgressMessage, slackFor } from "@viktor/slack";
import { DelayedError, type Job } from "bullmq";
import { tryLock } from "../lock.ts";
import { threadHistory } from "../thread-history.ts";

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function processAgentRun(job: Job<AgentRunJob>, token?: string): Promise<void> {
  const data = job.data;
  const lockKey = `thread:${data.workspaceId}:${data.channelId}:${data.threadTs}`;
  const release = await tryLock(lockKey, 20 * 60_000);
  if (!release) {
    // One run per thread at a time; later messages wait their turn in order.
    await job.moveToDelayed(Date.now() + 3_000, token);
    throw new DelayedError();
  }

  try {
    await execute(data);
  } finally {
    await release();
  }
}

async function execute(data: AgentRunJob): Promise<void> {
  const log = logger.child({ runId: data.runId, workspaceId: data.workspaceId });
  const [run, workspace] = await Promise.all([getRun(data.runId), getWorkspace(data.workspaceId)]);
  if (!run || !workspace || workspace.uninstalledAt) {
    log.warn("run or workspace missing, skipping");
    return;
  }

  const slack = await slackFor(workspace.id);
  const progress = new ProgressMessage(slack, data.channelId, data.threadTs);

  const budget = workspace.monthlyBudgetUsd ?? env().DEFAULT_MONTHLY_BUDGET_USD;
  if (budget > 0 && (await spendSince(workspace.id, monthStart())) >= budget) {
    await progress.fail(
      `This workspace has used its monthly budget of $${budget.toFixed(2)}. An admin can raise it from my App Home tab.`,
    );
    await finishRun(run.id, "cancelled", { error: "monthly budget exhausted" });
    return;
  }

  const thread = run.threadId ? await getThread(run.threadId) : undefined;

  await progress.start();
  await startRun(run.id);

  const sections: Array<{ title: string; body: string }> = [];
  if (!thread?.sessionId && data.messageTs && data.messageTs !== data.threadTs) {
    const history = await threadHistory(slack, data.channelId, data.threadTs, data.messageTs).catch(
      () => "",
    );
    sections.push({ title: "Thread so far", body: history });
  }
  if (data.files?.length) {
    sections.push({
      title: "Attached files",
      body: data.files.map((f) => `- ${f.name} (${f.mimetype}, ${f.size} bytes)`).join("\n"),
    });
  }

  const context = buildTurnContext({
    now: new Date(),
    timezone: workspace.timezone,
    requesterId: data.userId,
    channelId: data.channelId,
    trigger: data.trigger,
    sections,
  });

  try {
    const result = await runAgent({
      workspaceId: workspace.id,
      systemPrompt: buildSystemPrompt({
        name: workspace.name,
        persona: workspace.settings.persona,
      }),
      prompt: `${context}\n\n${data.text || "(no text, see attached files)"}`,
      resume: thread?.sessionId,
      onEvent: (event) => {
        if (event.type === "tool") progress.step(describeTool(event.name, event.input));
      },
    });

    const previousTotal = thread?.totalCostUsd ?? 0;
    const costUsd = Math.max(0, result.totalCostUsd - (thread?.sessionId ? previousTotal : 0));

    if (thread && result.sessionId) {
      await setThreadSession(thread.id, result.sessionId);
      await recordThreadCost(thread.id, result.totalCostUsd);
    }

    await finishRun(run.id, result.ok ? "succeeded" : "failed", {
      result: result.text,
      error: result.errors.join("; ") || null,
      numTurns: result.numTurns,
      costUsd,
      ...result.usage,
    });

    if (result.ok) {
      await progress.finish(result.text);
    } else {
      log.warn({ errors: result.errors }, "agent run did not succeed");
      await progress.fail(
        result.text ||
          "I couldn't finish that one. It ran out of time or budget before completing. Try narrowing the request.",
      );
    }
  } catch (err) {
    log.error({ err }, "agent run crashed");
    await finishRun(run.id, "failed", { error: err instanceof Error ? err.message : String(err) });
    await progress.fail(
      "Something went wrong on my side while working on this. The error has been logged.",
    );
  } finally {
    if (data.messageTs) {
      await slack.reactions
        .remove({ channel: data.channelId, timestamp: data.messageTs, name: "eyes" })
        .catch(() => undefined);
    }
  }
}
