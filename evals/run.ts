import { buildSystemPrompt, buildTurnContext, decide, runAgent } from "@viktor/agent";
import { composioMcpServer } from "@viktor/composio";
import {
  closeDb,
  getWorkspace,
  runMigrations,
  upsertWorkspace,
  wipeWorkspaceData,
} from "@viktor/db";
import { closeQueues, closeRedis, removeSchedule } from "@viktor/queue";
import { destroySandbox } from "@viktor/sandbox";
import { createViktorServer, VIKTOR_SERVER } from "@viktor/tools";
import { scenarios, type Transcript } from "./scenarios.ts";

const WORKSPACE_ID = "EVALS";
const only = process.argv[2];

await runMigrations();
await upsertWorkspace({
  id: WORKSPACE_ID,
  name: "Eval Co",
  botUserId: "BEVAL",
  installerUserId: "UEVAL",
  installation: {},
});
const workspace = (await getWorkspace(WORKSPACE_ID))!;

let failures = 0;
let total = 0;
for (const scenario of scenarios.filter((s) => !only || s.name.includes(only))) {
  await scenario.setup?.(WORKSPACE_ID);
  const t: Transcript = { text: "", tools: [], approvalsRequested: [], sharedFiles: [] };
  const started = Date.now();

  const result = await runAgent({
    workspaceId: WORKSPACE_ID,
    systemPrompt: buildSystemPrompt({ name: workspace.name }),
    prompt: `${buildTurnContext({ now: new Date(), timezone: "UTC", requesterId: "UEVAL", channelId: "CEVAL", trigger: "mention" })}\n\n${scenario.prompt}`,
    mcpServers: {
      composio: await composioMcpServer(WORKSPACE_ID),
      [VIKTOR_SERVER]: createViktorServer({
        workspaceId: WORKSPACE_ID,
        channelId: "CEVAL",
        threadTs: "0",
        userId: "UEVAL",
        timezone: "UTC",
        shareFile: async ({ filename }) => {
          t.sharedFiles.push(filename);
        },
      }),
    },
    canUseTool: async (name, input) => {
      const decision = decide(name, input);
      if (decision.action === "allow") return { behavior: "allow", updatedInput: input };
      t.approvalsRequested.push(...decision.actions);
      return { behavior: "deny", message: "Denied during evaluation." };
    },
    onEvent: (e) => {
      if (e.type === "tool") t.tools.push(e.name);
    },
  });
  t.text = result.text;

  const problem = result.ok ? scenario.check(t) : `run failed: ${result.errors.join("; ")}`;
  total++;
  if (problem) failures++;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `${problem ? "✗" : "✓"} ${scenario.name}  (${secs}s, $${result.totalCostUsd.toFixed(3)}, ${t.tools.length} tool calls)`,
  );
  if (problem) {
    console.log(`    ${problem}`);
    console.log(`    tools: ${t.tools.join(", ") || "none"}`);
    console.log(`    reply: ${t.text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
}

const wiped = await wipeWorkspaceData(WORKSPACE_ID);
await Promise.allSettled([...wiped.scheduleIds.map(removeSchedule), destroySandbox(WORKSPACE_ID)]);
console.log(`\n${total - failures}/${total} scenarios passed`);
await closeQueues();
await closeRedis();
await closeDb();
process.exit(failures ? 1 : 0);
