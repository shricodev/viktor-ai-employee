import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ToolContext } from "./context.ts";
import { memoryTools } from "./memory.ts";
import { sandboxTools } from "./sandbox.ts";
import { scheduleTools } from "./schedules.ts";
import { skillTools } from "./skills.ts";
import { slackTools } from "./slack.ts";
import { triggerTools } from "./triggers.ts";

export const VIKTOR_SERVER = "viktor";

/** In-process MCP server with Viktor's own tools, bound to one conversation. */
export function createViktorServer(ctx: ToolContext) {
  return createSdkMcpServer({
    name: VIKTOR_SERVER,
    version: "0.1.0",
    alwaysLoad: true,
    tools: [
      ...sandboxTools(ctx),
      ...slackTools(ctx),
      ...memoryTools(ctx),
      ...skillTools(ctx),
      ...scheduleTools(ctx),
      ...triggerTools(ctx),
    ],
  });
}
