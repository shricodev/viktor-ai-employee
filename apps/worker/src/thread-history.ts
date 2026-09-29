import type { WebClient } from "@slack/web-api";

const MAX_MESSAGES = 30;

/** Renders earlier messages of a Slack thread so a fresh session has the conversation so far. */
export async function threadHistory(
  client: WebClient,
  channel: string,
  threadTs: string,
  beforeTs: string,
): Promise<string> {
  const res = await client.conversations.replies({ channel, ts: threadTs, limit: 200 });
  const earlier = (res.messages ?? []).filter((m) => m.ts && m.ts < beforeTs).slice(-MAX_MESSAGES);
  return earlier
    .map((m) => `<@${m.user ?? m.bot_id ?? "unknown"}>: ${(m.text ?? "").slice(0, 2_000)}`)
    .join("\n");
}
