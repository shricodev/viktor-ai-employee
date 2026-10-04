import type { KnownBlock, WebClient } from "@slack/web-api";

/** Posts a top-level message, joining the channel first if the bot is not a member yet. */
export async function postRoot(
  slack: WebClient,
  channel: string,
  text: string,
  blocks?: KnownBlock[],
): Promise<string> {
  const post = () => slack.chat.postMessage({ channel, text, blocks });
  try {
    const res = await post();
    return res.ts!;
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error !== "not_in_channel") throw err;
    await slack.conversations.join({ channel });
    const res = await post();
    return res.ts!;
  }
}
