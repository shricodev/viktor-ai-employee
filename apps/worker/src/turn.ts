import type {
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt, buildTurnContext, runAgent } from "@viktor/agent";
import { composioMcpServer, extractConnectLinks, listConnections } from "@viktor/composio";
import { env, logger } from "@viktor/config";
import {
  finishRun,
  getThread,
  listSkills,
  type Run,
  recordThreadCost,
  searchMemories,
  setThreadSession,
  spendSince,
  startRun,
  type Workspace,
} from "@viktor/db";
import type { RunTrigger, SlackFileRef } from "@viktor/queue";
import { connectCard, describeTool, ProgressMessage, slackFor } from "@viktor/slack";
import { createViktorServer, embed, importSlackFiles, VIKTOR_SERVER } from "@viktor/tools";
import { approvalGate } from "./approval-gate.ts";
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

async function knowledgeSections(workspaceId: string, query: string) {
  const [memories, skills] = await Promise.all([
    query.trim()
      ? searchMemories({ workspaceId, query, embedding: await embed(query, "query"), limit: 8 })
      : Promise.resolve([]),
    listSkills(workspaceId),
  ]);
  return [
    {
      title: "Relevant memories",
      body: memories.map((m) => `- ${m.content} (id ${m.id})`).join("\n"),
    },
    {
      title: "Your skills",
      body: skills.map((s) => `- ${s.name}: ${s.description}`).join("\n"),
    },
  ];
}

async function connectedAppsSection(workspaceId: string) {
  const apps = await listConnections(workspaceId).catch((err) => {
    logger.warn({ err, workspaceId }, "could not list composio connections");
    return null;
  });
  if (!apps) return { title: "Connected apps", body: "Unknown (lookup failed)." };
  const active = apps.filter((a) => a.active).map((a) => a.slug);
  return {
    title: "Connected apps",
    body: active.length ? active.join(", ") : "None yet.",
  };
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

  const sections = [...(turn.extraSections ?? [])];
  if (!thread?.sessionId && turn.messageTs && turn.messageTs !== turn.threadTs) {
    const history = await threadHistory(slack, turn.channelId, turn.threadTs, turn.messageTs).catch(
      () => "",
    );
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
        ? imported.map((f) => `- ${f.name} → ${f.path} (${f.mimetype}, ${f.size} bytes)`).join("\n")
        : "The user attached files but they could not be downloaded.",
    });
  }
  const [knowledge, apps] = await Promise.all([
    knowledgeSections(workspace.id, turn.text).catch((err) => {
      log.warn({ err }, "failed to load memories and skills");
      return [];
    }),
    connectedAppsSection(workspace.id),
  ]);
  sections.push(...knowledge, apps);

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
      slack,
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

  try {
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

    const previousTotal = thread?.sessionId ? thread.totalCostUsd : 0;
    const costUsd = Math.max(0, result.totalCostUsd - previousTotal);

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
  }
}
