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

export type ApprovalView = {
  id: string;
  requestedBy?: string;
  calls: Array<{ action: string; args: unknown }>;
  canAlwaysAllow: boolean;
};

function preview(args: unknown, max: number): string {
  const json = JSON.stringify(args ?? {}, null, 2);
  return json.length > max ? `${json.slice(0, max)}\n…` : json;
}

export function approvalCard(view: ApprovalView): KnownBlock[] {
  const perCall = Math.floor(2400 / Math.max(view.calls.length, 1));
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:raised_hand: *Approval needed*${view.requestedBy ? ` for <@${view.requestedBy}>'s request` : ""}. I want to:`,
      },
    },
  ];
  for (const call of view.calls.slice(0, 5)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${titleCase(call.action)}*\n\`\`\`${preview(call.args, perCall)}\`\`\``,
      },
    });
  }
  const buttons: KnownBlock = {
    type: "actions",
    block_id: `approval:${view.id}`,
    elements: [
      {
        type: "button",
        action_id: "approval_approve",
        value: view.id,
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
      },
      {
        type: "button",
        action_id: "approval_deny",
        value: view.id,
        style: "danger",
        text: { type: "plain_text", text: "Deny" },
      },
      ...(view.canAlwaysAllow
        ? [
            {
              type: "button" as const,
              action_id: "approval_always",
              value: view.id,
              text: { type: "plain_text" as const, text: "Always allow" },
            },
          ]
        : []),
    ],
  };
  blocks.push(buttons);
  return blocks;
}

const OUTCOME_LABEL = {
  approved: ":white_check_mark: Approved",
  denied: ":no_entry: Denied",
  expired: ":hourglass: Expired, nobody responded in time",
} as const;

export function resolvedApprovalCard(
  actions: string[],
  outcome: keyof typeof OUTCOME_LABEL,
  decidedBy?: string | null,
  always = false,
): KnownBlock[] {
  const who = decidedBy ? ` by <@${decidedBy}>` : "";
  const note = always ? " (and allowed automatically from now on)" : "";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${OUTCOME_LABEL[outcome]}${who}${note}: ${actions.map(titleCase).join(", ")}`,
      },
    },
  ];
}
