import type { App } from "@slack/bolt";
import { env } from "@viktor/config";
import { findThread } from "@viktor/db";
import { enqueue } from "@viktor/queue";
import { dispatchRun } from "../dispatch.ts";
import { workspaceSettings } from "../settings-cache.ts";
import { stripMention, toFileRefs } from "../text.ts";

async function acknowledge(app: App, token: string | undefined, channel: string, ts: string) {
  await app.client.reactions
    .add({ token, channel, timestamp: ts, name: "eyes" })
    .catch(() => undefined);
}

export function registerMessageHandlers(app: App): void {
  app.event("app_mention", async ({ event, context }) => {
    if (!context.teamId || !context.botUserId || !event.user) return;
    await acknowledge(app, context.botToken, event.channel, event.ts);
    await dispatchRun({
      workspaceId: context.teamId,
      channelId: event.channel,
      threadTs: event.thread_ts ?? event.ts,
      messageTs: event.ts,
      userId: event.user,
      text: stripMention(event.text, context.botUserId),
      trigger: "mention",
      files: toFileRefs(event.files),
    });
  });

  app.message(async ({ message, context }) => {
    if (message.subtype && message.subtype !== "file_share") return;
    if (!("user" in message) || !message.user || message.user === context.botUserId) return;
    if (!context.teamId || !context.botUserId) return;
    if ("bot_id" in message && message.bot_id) return;

    const text = stripMention(message.text ?? "", context.botUserId);
    const isDm = message.channel_type === "im";
    const mentioned = (message.text ?? "").includes(`<@${context.botUserId}>`);
    // Mentions in channels arrive via app_mention as well; only handle them there.
    if (!isDm && mentioned) return;

    const threadTs = "thread_ts" in message ? message.thread_ts : undefined;
    if (!isDm) {
      const known = threadTs
        ? await findThread({ workspaceId: context.teamId, channelId: message.channel, threadTs })
        : undefined;
      if (!known) {
        const settings = await workspaceSettings(context.teamId);
        if (env().PROACTIVE_ENABLED && settings.proactiveChannels?.includes(message.channel)) {
          await enqueue(
            "channel-message",
            {
              workspaceId: context.teamId,
              channelId: message.channel,
              ts: message.ts,
              threadTs,
              userId: message.user,
              text: message.text ?? "",
            },
            { jobId: `watch-${context.teamId}-${message.channel}-${message.ts}`, attempts: 1 },
          );
        }
        return;
      }
    }

    await acknowledge(app, context.botToken, message.channel, message.ts);
    await dispatchRun({
      workspaceId: context.teamId,
      channelId: message.channel,
      threadTs: threadTs ?? message.ts,
      messageTs: message.ts,
      userId: message.user,
      text,
      trigger: isDm ? "dm" : "mention",
      files: toFileRefs("files" in message ? message.files : undefined),
    });
  });
}
