import type { WebClient } from "@slack/web-api";

export type ToolContext = {
  workspaceId: string;
  channelId: string;
  threadTs: string;
  userId?: string;
  timezone: string;
  slack: WebClient;
};

export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function json(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

export function error(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
