import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CanUseTool,
  type McpServerConfig,
  query,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { env, logger } from "@viktor/config";
import { postgresSessionStore } from "./session-store.ts";

export type AgentEvent =
  | { type: "tool"; name: string; input: Record<string, unknown> }
  | { type: "text"; text: string };

export type RunAgentInput = {
  workspaceId: string;
  prompt: string;
  systemPrompt: string;
  resume?: string | null;
  mcpServers?: Record<string, McpServerConfig>;
  builtinTools?: string[];
  canUseTool?: CanUseTool;
  signal?: AbortSignal;
  maxBudgetUsd?: number;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type RunAgentResult = {
  ok: boolean;
  text: string;
  errors: string[];
  sessionId?: string;
  numTurns: number;
  totalCostUsd: number;
  usage: Usage;
};

export const DEFAULT_BUILTIN_TOOLS = ["WebSearch", "WebFetch", "TodoWrite"];

async function scratchDir(workspaceId: string): Promise<string> {
  const dir = join(tmpdir(), "viktor", workspaceId);
  await mkdir(join(dir, "claude"), { recursive: true });
  return dir;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const config = env();
  const cwd = await scratchDir(input.workspaceId);
  const abort = new AbortController();
  const timeout = setTimeout(
    () => abort.abort(new Error("agent run timed out")),
    config.AGENT_TIMEOUT_MS,
  );
  input.signal?.addEventListener("abort", () => abort.abort(input.signal?.reason), { once: true });

  const builtins = input.builtinTools ?? DEFAULT_BUILTIN_TOOLS;
  const q = query({
    prompt: input.prompt,
    options: {
      abortController: abort,
      cwd,
      model: config.AGENT_MODEL,
      effort: config.AGENT_EFFORT,
      maxTurns: config.AGENT_MAX_TURNS,
      maxBudgetUsd: input.maxBudgetUsd ?? config.AGENT_MAX_RUN_USD,
      systemPrompt: { type: "custom", prompt: input.systemPrompt },
      tools: builtins,
      mcpServers: input.mcpServers,
      strictMcpConfig: true,
      settingSources: [],
      permissionMode: "default",
      canUseTool: input.canUseTool,
      resume: input.resume ?? undefined,
      sessionStore: postgresSessionStore,
      // The subprocess gets a minimal environment so it never sees our database or Slack secrets.
      env: {
        PATH: process.env.PATH,
        HOME: cwd,
        ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
        CLAUDE_CONFIG_DIR: join(cwd, "claude"),
        CLAUDE_AGENT_SDK_CLIENT_APP: "viktor/0.1.0",
      },
      stderr: (data) => logger.debug({ workspaceId: input.workspaceId, data }, "agent stderr"),
    },
  });

  let sessionId: string | undefined;
  let result: SDKResultMessage | undefined;
  const usageByMessage = new Map<string, Usage>();

  try {
    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
      } else if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
        const u = msg.message.usage;
        usageByMessage.set(msg.message.id, {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        });
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            await input.onEvent?.({
              type: "tool",
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
            });
          } else if (block.type === "text" && block.text.trim()) {
            await input.onEvent?.({ type: "text", text: block.text });
          }
        }
      } else if (msg.type === "result") {
        result = msg;
        sessionId ??= msg.session_id;
      }
    }
  } catch (err) {
    if (!abort.signal.aborted) throw err;
    logger.warn(
      { workspaceId: input.workspaceId, reason: String(abort.signal.reason) },
      "agent aborted",
    );
  } finally {
    clearTimeout(timeout);
  }

  const usage = [...usageByMessage.values()].reduce<Usage>(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + u.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );

  if (!result) {
    return {
      ok: false,
      text: "",
      errors: [
        abort.signal.aborted ? String(abort.signal.reason) : "agent exited without a result",
      ],
      sessionId,
      numTurns: 0,
      totalCostUsd: 0,
      usage,
    };
  }

  return {
    ok: result.subtype === "success" && !result.is_error,
    text: result.subtype === "success" ? result.result : "",
    errors: result.subtype === "success" ? [] : [result.subtype, ...result.errors],
    sessionId,
    numTurns: result.num_turns,
    totalCostUsd: result.total_cost_usd,
    usage,
  };
}
