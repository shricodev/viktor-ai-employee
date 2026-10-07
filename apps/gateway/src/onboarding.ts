import { WebClient } from "@slack/web-api";
import { updateWorkspace } from "@viktor/db";

const EXAMPLES = [
  "Summarize my unread emails and draft replies to anything urgent",
  "Pull last month's revenue from Stripe and make me a PDF report with charts",
  "Every Monday at 9, post open PRs that have been waiting for review more than 2 days",
  "When a new lead lands in HubSpot, research the company and post a brief here",
];

/** First-install flow: adopt the installer's timezone and introduce Viktor in a DM. */
export async function welcome(workspaceId: string, botToken: string, installerId: string) {
  const client = new WebClient(botToken);
  const user = await client.users.info({ user: installerId }).catch(() => null);
  if (user?.user?.tz) await updateWorkspace(workspaceId, { timezone: user.user.tz });

  const dm = await client.conversations.open({ users: installerId });
  if (!dm.channel?.id) return;
  await client.chat.postMessage({
    channel: dm.channel.id,
    text: "Hi, I'm Viktor, your new AI employee.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Hi, I'm Viktor* :wave:\nI'm an AI employee for your team. Give me real work, in a DM or by mentioning me in any channel, and I'll get it done using your apps and my own computer.",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Things you can ask me*\n${EXAMPLES.map((e) => `• _${e}_`).join("\n")}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "When I need an app you haven't connected, I'll send a one-click link. I always ask before sending, posting, or deleting anything. Open my *Home* tab to see usage, schedules, what I've learned, and settings.",
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Tip: invite me to a channel with `/invite @Viktor`." }],
      },
    ],
  });
}
