import type { KnownBlock } from "@slack/web-api";

export const MARKDOWN_BLOCK_LIMIT = 12_000;

/** Splits text into chunks under `limit`, preferring paragraph, then line, then hard breaks. */
export function chunkText(text: string, limit = MARKDOWN_BLOCK_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = window.lastIndexOf("\n\n");
    if (cut < limit / 2) cut = window.lastIndexOf("\n");
    if (cut < limit / 2) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function markdownBlocks(text: string): KnownBlock[] {
  return [{ type: "markdown", text } as KnownBlock];
}

/** Plain-text fallback for notifications, where Slack does not render Markdown. */
export function plainPreview(text: string, max = 280): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
