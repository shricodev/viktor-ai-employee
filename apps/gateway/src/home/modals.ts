import type { View } from "@slack/web-api";

export function connectModal(): View {
  return {
    type: "modal",
    callback_id: "connect_app",
    title: { type: "plain_text", text: "Connect an app" },
    submit: { type: "plain_text", text: "Get link" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "app",
        label: { type: "plain_text", text: "Which app?" },
        hint: {
          type: "plain_text",
          text: "Any of 1,000+ apps: gmail, googlesheets, outlook, excel, notion, github, linear, hubspot, salesforce…",
        },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: { type: "plain_text", text: "e.g. googlesheets" },
        },
      },
    ],
  };
}

export function connectLinkModal(app: string, url: string): View {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Connect an app" },
    close: { type: "plain_text", text: "Done" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Open the link to connect *${app}*. The connection is shared with everyone in this workspace.`,
        },
        accessory: {
          type: "button",
          action_id: "connect_open",
          text: { type: "plain_text", text: `Connect ${app}` },
          url,
          style: "primary",
        },
      },
    ],
  };
}

export function settingsModal(input: {
  budgetUsd: number;
  timezone: string;
  persona?: string;
}): View {
  return {
    type: "modal",
    callback_id: "settings",
    title: { type: "plain_text", text: "Viktor settings" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "budget",
        label: { type: "plain_text", text: "Monthly budget (USD, 0 for no limit)" },
        element: {
          type: "number_input",
          action_id: "value",
          is_decimal_allowed: true,
          min_value: "0",
          initial_value: String(input.budgetUsd),
        },
      },
      {
        type: "input",
        block_id: "timezone",
        label: { type: "plain_text", text: "Timezone" },
        hint: { type: "plain_text", text: "IANA name, e.g. America/New_York or Asia/Kathmandu" },
        element: { type: "plain_text_input", action_id: "value", initial_value: input.timezone },
      },
      {
        type: "input",
        block_id: "persona",
        optional: true,
        label: { type: "plain_text", text: "How should Viktor work with your team?" },
        hint: {
          type: "plain_text",
          text: "Tone, conventions, things to always or never do. Added to every conversation.",
        },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          max_length: 2000,
          ...(input.persona ? { initial_value: input.persona } : {}),
        },
      },
    ],
  };
}
