import { tool } from "@anthropic-ai/claude-agent-sdk";
import { execInSandbox, MAX_FILE_BYTES, readSandboxFile, writeSandboxFile } from "@viktor/sandbox";
import { z } from "zod";
import { error, json, type ToolContext, text } from "./context.ts";

const TEXT_READ_LIMIT = 200_000;

export function sandboxTools(ctx: ToolContext) {
  return [
    tool(
      "sandbox_exec",
      "Run a bash command on your own Linux computer (Debian, Python 3.12 with pandas/matplotlib/openpyxl/python-docx/python-pptx/reportlab, Node 22, LibreOffice, pandoc). The working directory /workspace persists between conversations. Use it to analyse data, write and run scripts, and produce files. Install extra Python packages with `pip install <pkg>`.",
      {
        command: z.string().describe("Bash command to run"),
        timeout_sec: z.number().int().min(1).max(900).optional().describe("Defaults to 120"),
        cwd: z.string().optional().describe("Directory inside /workspace"),
      },
      async ({ command, timeout_sec, cwd }) => {
        const res = await execInSandbox(ctx.workspaceId, command, { timeoutSec: timeout_sec, cwd });
        return json({
          exit_code: res.exitCode,
          timed_out: res.timedOut,
          stdout: res.stdout,
          stderr: res.stderr,
        });
      },
    ),

    tool(
      "sandbox_write_file",
      "Create or overwrite a text file on your computer. Paths are relative to /workspace.",
      {
        path: z.string(),
        content: z.string(),
      },
      async ({ path, content }) => {
        const written = await writeSandboxFile(ctx.workspaceId, path, content);
        return text(`Wrote ${Buffer.byteLength(content)} bytes to ${written}`);
      },
    ),

    tool(
      "sandbox_read_file",
      "Read a text file from your computer. For binary files (PDF, XLSX, images) use sandbox_exec with an appropriate tool instead.",
      { path: z.string() },
      async ({ path }) => {
        const buf = await readSandboxFile(ctx.workspaceId, path, MAX_FILE_BYTES);
        if (buf.includes(0))
          return error("That file is binary. Inspect it with sandbox_exec instead.");
        const content = buf.toString("utf8");
        return text(
          content.length > TEXT_READ_LIMIT
            ? `${content.slice(0, TEXT_READ_LIMIT)}\n…[truncated, ${content.length} characters total]`
            : content,
        );
      },
      { annotations: { readOnlyHint: true } },
    ),
  ];
}
