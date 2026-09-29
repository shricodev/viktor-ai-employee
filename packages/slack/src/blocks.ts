import type { KnownBlock } from "@slack/web-api";

export type ConnectLinkView = { toolkit: string; url: string };

export function titleCase(slug: string): string {
  return slug
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function connectCard(links: ConnectLinkView[]): KnownBlock[] {
  const names = links.map((l) => titleCase(l.toolkit));
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:electric_plug: I need access to *${names.join(", ")}* to continue. Connecting takes about a minute and is shared with the whole workspace.`,
      },
    },
    {
      type: "actions",
      elements: links.slice(0, 5).map((l, i) => ({
        type: "button",
        action_id: `connect_${i}`,
        text: { type: "plain_text", text: `Connect ${titleCase(l.toolkit)}` },
        url: l.url,
        style: "primary",
      })),
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "Reply here once you're connected and I'll pick it back up." },
      ],
    },
  ];
}
