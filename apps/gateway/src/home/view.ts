import type { KnownBlock, View } from "@slack/web-api";
import { titleCase } from "@viktor/slack";

export type HomeData = {
  isAdmin: boolean;
  name: string;
  timezone: string;
  budgetUsd: number;
  spendUsd: number;
  runsThisMonth: number;
  connections: Array<{ slug: string; name: string }> | null;
  proactiveChannels: string[];
  checkinChannelId?: string;
  schedules: Array<{
    id: string;
    name: string;
    cron: string;
    channelId: string;
    enabled: boolean;
    nextRun?: string;
  }>;
  triggers: Array<{ id: string; triggerSlug: string; channelId: string }>;
  memoryCount: number;
  recentMemories: Array<{ id: string; content: string }>;
  skills: Array<{ name: string; description: string }>;
  autoApproved: string[];
};

const LIST_LIMIT = 8;

const md = (text: string): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text } });
const header = (text: string): KnownBlock => ({
  type: "header",
  text: { type: "plain_text", text },
});
const context = (text: string): KnownBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});
const divider: KnownBlock = { type: "divider" };

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function usageBar(spend: number, budget: number): string {
  if (budget <= 0) return "No monthly limit";
  const pct = Math.min(spend / budget, 1);
  const filled = Math.round(pct * 20);
  return `\`${"█".repeat(filled)}${"░".repeat(20 - filled)}\` ${Math.round(pct * 100)}%`;
}

function button(text: string, actionId: string, value?: string, style?: "primary" | "danger") {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text },
    action_id: actionId,
    ...(value ? { value } : {}),
    ...(style ? { style } : {}),
  };
}

export function buildHomeView(d: HomeData): View {
  const blocks: KnownBlock[] = [
    header("Viktor"),
    md(
      "Your AI employee. Mention me in any channel or DM me with real work: reports, research, updates across your apps, follow-ups. I ask before doing anything risky.",
    ),
    {
      type: "actions",
      elements: [
        button("Connect an app", "home_connect", undefined, "primary"),
        ...(d.isAdmin ? [button("Settings", "home_settings")] : []),
      ],
    },
    divider,

    header("Usage this month"),
    md(
      `*$${d.spendUsd.toFixed(2)}* of ${d.budgetUsd > 0 ? `$${d.budgetUsd.toFixed(2)}` : "unlimited"} · ${d.runsThisMonth} tasks\n${usageBar(d.spendUsd, d.budgetUsd)}`,
    ),
    divider,

    header("Connected apps"),
    md(
      d.connections === null
        ? "_Couldn't load connections right now._"
        : d.connections.length
          ? d.connections.map((c) => `• ${c.name}`).join("\n")
          : "_Nothing connected yet. Ask me to do something in any app and I'll send a link, or use Connect an app._",
    ),
    divider,

    header("Watching channels"),
  ];

  if (d.isAdmin) {
    blocks.push({
      type: "section",
      block_id: "watch",
      text: {
        type: "mrkdwn",
        text: "I read these channels, remember useful facts and jump in when I can clearly help.",
      },
      accessory: {
        type: "multi_conversations_select",
        action_id: "home_watch_channels",
        placeholder: { type: "plain_text", text: "Pick channels" },
        filter: { include: ["public", "private"], exclude_bot_users: true },
        ...(d.proactiveChannels.length ? { initial_conversations: d.proactiveChannels } : {}),
      },
    });
  } else {
    blocks.push(
      md(
        d.proactiveChannels.length
          ? d.proactiveChannels.map((c) => `<#${c}>`).join(", ")
          : "_None_",
      ),
    );
  }

  blocks.push(header("Daily check-in"));
  if (d.isAdmin) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: d.checkinChannelId
          ? `Weekdays at 9:00 (${d.timezone}) in <#${d.checkinChannelId}>.`
          : "Off. Pick a channel for a short weekday-morning briefing.",
      },
      accessory: {
        type: "conversations_select",
        action_id: "home_checkin_channel",
        placeholder: { type: "plain_text", text: "Choose channel" },
        filter: { include: ["public", "private"], exclude_bot_users: true },
        ...(d.checkinChannelId ? { initial_conversation: d.checkinChannelId } : {}),
      },
    });
    if (d.checkinChannelId) {
      blocks.push({ type: "actions", elements: [button("Turn off", "home_checkin_disable")] });
    }
  } else {
    blocks.push(md(d.checkinChannelId ? `In <#${d.checkinChannelId}> on weekdays.` : "_Off_"));
  }
  blocks.push(divider);

  blocks.push(header("Schedules"));
  if (!d.schedules.length)
    blocks.push(
      context("No recurring work yet. Try: _every Monday at 9, post last week's signups here_"),
    );
  for (const s of d.schedules.slice(0, LIST_LIMIT)) {
    const status = s.enabled ? (s.nextRun ? `next ${s.nextRun}` : "active") : "paused";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${clip(s.name, 80)}* · \`${s.cron}\` · <#${s.channelId}>\n${status}`,
      },
      ...(d.isAdmin
        ? {
            accessory: {
              type: "overflow",
              action_id: "home_schedule_menu",
              options: [
                {
                  text: { type: "plain_text", text: s.enabled ? "Pause" : "Resume" },
                  value: `${s.enabled ? "pause" : "resume"}:${s.id}`,
                },
                { text: { type: "plain_text", text: "Delete" }, value: `delete:${s.id}` },
              ],
            },
          }
        : {}),
    });
  }
  blocks.push(divider);

  blocks.push(header("App triggers"));
  if (!d.triggers.length) blocks.push(context("Not reacting to any app events yet."));
  for (const t of d.triggers.slice(0, LIST_LIMIT)) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${titleCase(t.triggerSlug)}* → <#${t.channelId}>` },
      ...(d.isAdmin ? { accessory: button("Remove", "home_trigger_delete", t.id) } : {}),
    });
  }
  blocks.push(divider);

  blocks.push(header("What I know"));
  blocks.push(
    md(
      `${d.memoryCount} memories · ${d.skills.length} skills${
        d.skills.length
          ? `\n${d.skills
              .slice(0, LIST_LIMIT)
              .map((s) => `• *${s.name}*: ${clip(s.description, 120)}`)
              .join("\n")}`
          : ""
      }`,
    ),
  );
  for (const m of d.recentMemories.slice(0, 5)) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `> ${clip(m.content, 280)}` },
      ...(d.isAdmin ? { accessory: button("Forget", "home_memory_forget", m.id) } : {}),
    });
  }

  if (d.autoApproved.length) {
    blocks.push(divider, header("Always allowed"));
    for (const slug of d.autoApproved.slice(0, LIST_LIMIT)) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: titleCase(slug) },
        ...(d.isAdmin ? { accessory: button("Require approval", "home_auto_revoke", slug) } : {}),
      });
    }
  }

  if (d.isAdmin) {
    blocks.push(divider, header("Danger zone"), {
      type: "actions",
      elements: [
        {
          ...button("Wipe everything I've learned", "home_wipe", undefined, "danger"),
          confirm: {
            title: { type: "plain_text", text: "Wipe workspace data?" },
            text: {
              type: "mrkdwn",
              text: "This permanently deletes memories, skills, schedules, triggers, conversation history and files on my computer. Installation and app connections stay.",
            },
            confirm: { type: "plain_text", text: "Wipe" },
            deny: { type: "plain_text", text: "Cancel" },
            style: "danger",
          },
        },
      ],
    });
  }

  return { type: "home", blocks: blocks.slice(0, 100) };
}
