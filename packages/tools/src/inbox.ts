import type { WebClient } from "@slack/web-api";
import { logger } from "@viktor/config";
import type { SlackFileRef } from "@viktor/queue";
import { MAX_FILE_BYTES, writeSandboxFile } from "@viktor/sandbox";

export type ImportedFile = { name: string; path: string; mimetype: string; size: number };

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

/** Copies files attached to a Slack message into the sandbox so the agent can work on them. */
export async function importSlackFiles(
  workspaceId: string,
  slack: WebClient,
  files: SlackFileRef[],
): Promise<ImportedFile[]> {
  const imported: ImportedFile[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      logger.warn({ workspaceId, file: f.name }, "skipping oversized slack file");
      continue;
    }
    const res = await fetch(f.urlPrivate, { headers: { Authorization: `Bearer ${slack.token}` } });
    if (!res.ok) {
      logger.warn({ workspaceId, file: f.name, status: res.status }, "slack file download failed");
      continue;
    }
    const path = await writeSandboxFile(
      workspaceId,
      `inbox/${f.id}-${safeName(f.name)}`,
      Buffer.from(await res.arrayBuffer()),
    );
    imported.push({ name: f.name, path, mimetype: f.mimetype, size: f.size });
  }
  return imported;
}
