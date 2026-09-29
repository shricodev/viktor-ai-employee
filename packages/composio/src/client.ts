import { Composio } from "@composio/core";
import { env } from "@viktor/config";

let instance: Composio | undefined;

export function composio(): Composio {
  instance ??= new Composio({ apiKey: env().COMPOSIO_API_KEY });
  return instance;
}

/** Integrations are shared by the whole Slack workspace, the same way a human hire's would be. */
export function composioUserId(workspaceId: string): string {
  return `slack_${workspaceId}`;
}
