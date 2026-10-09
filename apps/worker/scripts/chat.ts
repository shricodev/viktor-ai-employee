import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { buildSystemPrompt, buildTurnContext, decide, runAgent } from "@viktor/agent";
import { composioMcpServer, extractConnectLinks } from "@viktor/composio";
import { closeDb, getWorkspace, runMigrations, upsertWorkspace } from "@viktor/db";
import { closeQueues, closeRedis } from "@viktor/queue";
import { describeTool } from "@viktor/slack";
import { createViktorServer, VIKTOR_SERVER } from "@viktor/tools";
import { workspaceContext } from "../src/context.ts";

const WORKSPACE_ID = process.env.VIKTOR_CLI_WORKSPACE ?? "LOCAL";
const OUT_DIR = resolve("viktor-out");

await runMigrations();
if (!(await getWorkspace(WORKSPACE_ID))) {
  await upsertWorkspace({
    id: WORKSPACE_ID,
    name: "Local",
    botUserId: "BLOCAL",
    installerUserId: "ULOCAL",
    installation: {},
  });
}
const workspace = (await getWorkspace(WORKSPACE_ID))!;
const rl = createInterface({ input: process.stdin, output: process.stdout });
let sessionId: string | undefined;

console.log(styleText("bold", "Viktor (local)"));
console.log(
  styleText(
    "dim",
    "Same agent, tools and Composio integrations as in Slack. /new resets, /exit quits.",
  ),
);

while (true) {
  const text = (await rl.question(styleText("cyan", "\nyou › "))).trim();
  if (!text) continue;
  if (text === "/exit") break;
  if (text === "/new") {
    sessionId = undefined;
    console.log(styleText("dim", "Started a new conversation."));
    continue;
  }

  const context = buildTurnContext({
    now: new Date(),
    timezone: workspace.timezone,
    channelId: "CLI",
    trigger: "terminal",
    sections: await workspaceContext(workspace.id, text),
  });

  const result = await runAgent({
    workspaceId: workspace.id,
    systemPrompt: buildSystemPrompt({ name: workspace.name, persona: workspace.settings.persona }),
    prompt: `${context}\n\n${text}`,
    resume: sessionId,
    mcpServers: {
      composio: await composioMcpServer(workspace.id),
      [VIKTOR_SERVER]: createViktorServer({
        workspaceId: workspace.id,
        channelId: "CLI",
        threadTs: "0",
        timezone: workspace.timezone,
        shareFile: async ({ file, filename }) => {
          await mkdir(OUT_DIR, { recursive: true });
          const path = join(OUT_DIR, filename);
          await writeFile(path, file);
          console.log(styleText("green", `  📎 saved ${path}`));
        },
      }),
    },
    hooks: {
      PostToolUse: [
        {
          matcher: "mcp__composio__COMPOSIO_MANAGE_CONNECTIONS",
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PostToolUse") return {};
              for (const link of extractConnectLinks(input.tool_response)) {
                console.log(styleText("yellow", `  🔌 connect ${link.toolkit}: ${link.url}`));
              }
              return {};
            },
          ],
        },
      ],
    },
    canUseTool: async (name, input) => {
      const decision = decide(name, input, { autoApproved: workspace.settings.autoApprovedTools });
      if (decision.action === "allow") return { behavior: "allow", updatedInput: input };
      console.log(styleText("yellow", `\n  ✋ approval needed: ${decision.actions.join(", ")}`));
      console.log(styleText("dim", JSON.stringify(input, null, 2).slice(0, 2000)));
      const answer = (await rl.question("  approve? [y/N] ")).trim().toLowerCase();
      return answer === "y"
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: "The user denied this action in the terminal." };
    },
    onEvent: (event) => {
      if (event.type === "tool")
        console.log(styleText("dim", `  · ${describeTool(event.name, event.input)}`));
    },
  });

  sessionId = result.sessionId ?? sessionId;
  console.log(
    `\n${styleText("magenta", "viktor ›")} ${result.ok ? result.text : `failed: ${result.errors.join("; ")}`}`,
  );
  console.log(
    styleText("dim", `  ${result.numTurns} turns · $${result.totalCostUsd.toFixed(4)} so far`),
  );
}

rl.close();
await closeQueues();
await closeRedis();
await closeDb();
