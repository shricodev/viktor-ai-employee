import type { SlackFileRef } from "@viktor/queue";

export function stripMention(text: string, botUserId: string): string {
  return text.replaceAll(`<@${botUserId}>`, "").replace(/\s+/g, " ").trim();
}

type RawFile = {
  id: string;
  name?: string | null;
  mimetype?: string;
  url_private?: string;
  size?: number;
};

export function toFileRefs(files: RawFile[] | undefined): SlackFileRef[] | undefined {
  const refs = (files ?? [])
    .filter((f) => f.url_private)
    .map((f) => ({
      id: f.id,
      name: f.name ?? f.id,
      mimetype: f.mimetype ?? "application/octet-stream",
      urlPrivate: f.url_private!,
      size: f.size ?? 0,
    }));
  return refs.length ? refs : undefined;
}
