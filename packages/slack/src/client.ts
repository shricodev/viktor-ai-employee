import { WebClient } from "@slack/web-api";
import { getBotToken } from "@viktor/db";

const cache = new Map<string, { client: WebClient; expires: number }>();
const TTL_MS = 5 * 60_000;

export async function slackFor(workspaceId: string): Promise<WebClient> {
  const hit = cache.get(workspaceId);
  if (hit && hit.expires > Date.now()) return hit.client;
  const client = new WebClient(await getBotToken(workspaceId), {
    retryConfig: { retries: 3 },
  });
  cache.set(workspaceId, { client, expires: Date.now() + TTL_MS });
  return client;
}

export function forgetSlackClient(workspaceId: string): void {
  cache.delete(workspaceId);
}
