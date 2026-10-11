import type {
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt, buildTurnContext, runAgent } from "@viktor/agent";
import { composioMcpServer, extractConnectLinks } from "@viktor/composio";
import { env, logger } from "@viktor/config";
import {
  finishRun,
  getThread,
  type Run,
  recordThreadCost,
  setThreadSession,
  spendSince,
  startRun,
  type Workspace,
} from "@viktor/db";
import type { RunTrigger, SlackFileRef } from "@viktor/queue";
import { connectCard, describeTool, ProgressMessage, slackFor } from "@viktor/slack";
import { createViktorServer, importSlackFiles, VIKTOR_SERVER } from "@viktor/tools";
import { approvalGate } from "./approval-gate.ts";
import { workspaceContext } from "./context.ts";
import { threadLockKey, tryLock } from "./lock.ts";
import { threadHistory } from "./thread-history.ts";

export type Turn = {
  run: Run;
  workspace: Workspace;
  channelId: string;
  threadTs: string;
  messageTs?: string;
  userId?: string;
  text: string;
  trigger: RunTrigger;
  files?: SlackFileRef[];
  extraSections?: Array<{ title: string; body: string }>;
};

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Runs one agent turn for a Slack thread and posts the outcome there. */
export async function runTurn(turn: Turn): Promise<void> {
  const { run, workspace } = turn;
  const log = logger.child({ runId: run.id, workspaceId: workspace.id });
  const slack = await slackFor(workspace.id);
  const progress = new ProgressMessage(slack, turn.channelId, turn.threadTs);

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

  let outcome: { ok: boolean; text: string } | undefined;
  try {
    const sections = [...(turn.extraSections ?? [])];
    if (!thread?.sessionId && turn.messageTs && turn.messageTs !== turn.threadTs) {
      const history = await threadHistory(
        slack,
        turn.channelId,
        turn.threadTs,
        turn.messageTs,
      ).catch(() => "");
      sections.push({ title: "Thread so far", body: history });
    }
    if (turn.files?.length) {
      progress.step("Reading attached files");
      const imported = await importSlackFiles(workspace.id, slack, turn.files).catch((err) => {
        log.warn({ err }, "failed to import slack files");
        return [];
      });
      sections.push({
        title: "Attached files",
        body: imported.length
          ? imported
              .map((f) => `- ${f.name} → ${f.path} (${f.mimetype}, ${f.size} bytes)`)
              .join("\n")
          : "The user attached files but they could not be downloaded.",
      });
    }
    sections.push(...(await workspaceContext(workspace.id, turn.text)));

    const context = buildTurnContext({
      now: new Date(),
      timezone: workspace.timezone,
      requesterId: turn.userId,
      channelId: turn.channelId,
      trigger: turn.trigger,
      sections,
    });

    const mcpServers: Record<string, McpServerConfig> = {
      composio: await composioMcpServer(workspace.id),
      [VIKTOR_SERVER]: createViktorServer({
        workspaceId: workspace.id,
        channelId: turn.channelId,
        threadTs: turn.threadTs,
        userId: turn.userId,
        timezone: workspace.timezone,
        shareFile: async ({ file, filename, title, comment }) => {
          await slack.files.uploadV2({
            channel_id: turn.channelId,
            thread_ts: turn.threadTs,
            file,
            filename,
            title,
            initial_comment: comment,
          });
        },
      }),
    };

    const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
      PostToolUse: [
        {
          matcher: "mcp__composio__COMPOSIO_MANAGE_CONNECTIONS",
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PostToolUse") return {};
              const links = extractConnectLinks(input.tool_response);
              if (!links.length) return {};
              await slack.chat.postMessage({
                channel: turn.channelId,
                thread_ts: turn.threadTs,
                text: `Connect ${links.map((l) => l.toolkit).join(", ")} to continue`,
                blocks: connectCard(links),
              });
              return {
                hookSpecificOutput: {
                  hookEventName: "PostToolUse",
                  additionalContext: `Connect buttons for ${links.map((l) => l.toolkit).join(", ")} were posted in the thread.`,
                },
              };
            },
          ],
        },
      ],
    };

    const result = await runAgent({
      workspaceId: workspace.id,
      systemPrompt: buildSystemPrompt({
        name: workspace.name,
        persona: workspace.settings.persona,
      }),
      prompt: `${context}\n\n${turn.text || "(no text, see attached files)"}`,
      resume: thread?.sessionId,
      mcpServers,
      hooks,
      canUseTool: approvalGate({
        workspaceId: workspace.id,
        runId: run.id,
        channelId: turn.channelId,
        threadTs: turn.threadTs,
        requestedBy: turn.userId,
        autoApproved: workspace.settings.autoApprovedTools ?? [],
        onWaiting: (label) => progress.step(label),
      }),
      onEvent: (event) => {
        if (event.type === "tool") progress.step(describeTool(event.name, event.input));
      },
    });

    // Resumed sessions report cumulative cost; runs without a result report nothing reliable,
    // so their spend is picked up by the next completed turn instead of resetting the total.
    const previousTotal = thread?.sessionId ? thread.totalCostUsd : 0;
    const costUsd = result.completed ? Math.max(0, result.totalCostUsd - previousTotal) : 0;
    if (thread && result.sessionId) {
      await setThreadSession(thread.id, result.sessionId);
      if (result.completed && result.totalCostUsd > previousTotal) {
        await recordThreadCost(thread.id, result.totalCostUsd);
      }
    }

    await finishRun(run.id, result.ok ? "succeeded" : "failed", {
      result: result.text,
      error: result.errors.join("; ") || null,
      numTurns: result.numTurns,
      costUsd,
      ...result.usage,
    });
    if (!result.ok) log.warn({ errors: result.errors }, "agent run did not succeed");
    outcome = {
      ok: result.ok,
      text:
        result.text ||
        "I couldn't finish that one. It ran out of time or budget before completing. Try narrowing the request.",
    };
  } catch (err) {
    log.error({ err }, "agent run crashed");
    await finishRun(run.id, "failed", { error: err instanceof Error ? err.message : String(err) });
    outcome = {
      ok: false,
      text: "Something went wrong on my side while working on this. The error has been logged.",
    };
  }

  try {
    if (outcome.ok) await progress.finish(outcome.text);
    else await progress.fail(outcome.text);
  } catch (err) {
    log.error({ err }, "failed to deliver the result to slack");
  }
}

/**
 * Runs a turn that Viktor starts on its own (schedules, triggers, proactive replies). It takes
 * the same per-thread lock as message-driven runs so a reply arriving mid-run waits its turn.
 */
export async function runLockedTurn(turn: Turn): Promise<void> {
  const release = await tryLock(
    threadLockKey(turn.workspace.id, turn.channelId, turn.threadTs),
    env().AGENT_TIMEOUT_MS + 5 * 60_000,
  );
  if (!release) {
    logger.warn({ runId: turn.run.id }, "thread is busy, skipping self-started run");
    await finishRun(turn.run.id, "cancelled", { error: "thread busy" });
    return;
  }
  try {
    await runTurn(turn);
  } finally {
    await release();
  }
}
