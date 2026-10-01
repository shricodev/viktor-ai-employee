import { posix } from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { readSandboxFile } from "@viktor/sandbox";
import { z } from "zod";
import { type ToolContext, text } from "./context.ts";

export function slackTools(ctx: ToolContext) {
  return [
    tool(
      "slack_upload_file",
      "Share a file from your computer in the current Slack thread. Use this to deliver reports, spreadsheets, documents, decks and charts you produced.",
      {
        path: z.string().describe("Path inside /workspace"),
        title: z.string().optional(),
        comment: z.string().optional().describe("Short message posted with the file"),
      },
      async ({ path, title, comment }) => {
        const file = await readSandboxFile(ctx.workspaceId, path);
        const filename = posix.basename(path);
        await ctx.slack.files.uploadV2({
          channel_id: ctx.channelId,
          thread_ts: ctx.threadTs,
          file,
          filename,
          title: title ?? filename,
          initial_comment: comment,
        });
        return text(`Shared ${filename} (${file.length} bytes) in the thread.`);
      },
    ),
  ];
}
