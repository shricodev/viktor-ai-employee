import { createHash } from "node:crypto";
import { composio, composioUserId } from "./client.ts";

export type TriggerType = {
  slug: string;
  name: string;
  description: string;
  instructions?: string;
  config?: unknown;
};

export async function listTriggerTypes(toolkit: string): Promise<TriggerType[]> {
  const res = await composio().triggers.listTypes({ toolkits: [toolkit.toLowerCase()], limit: 50 });
  return res.items.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    instructions: t.instructions,
    config: (t as { config?: unknown }).config,
  }));
}

export async function createTrigger(
  workspaceId: string,
  slug: string,
  triggerConfig: Record<string, unknown>,
): Promise<string> {
  const res = await composio().triggers.create(composioUserId(workspaceId), slug, {
    triggerConfig,
  });
  return res.triggerId;
}

export async function deleteTrigger(triggerId: string): Promise<void> {
  await composio().triggers.delete(triggerId);
}

export type TriggerEvent = {
  eventId: string;
  triggerId: string;
  triggerSlug: string;
  toolkit: string;
  userId: string;
  payload: Record<string, unknown>;
};

export async function parseTriggerWebhook(
  request: { body: string; headers: Record<string, string | string[] | undefined> },
  secret: string | undefined,
): Promise<TriggerEvent> {
  const result = await composio().triggers.parse(request, secret ? { verifySecret: secret } : {});
  const p = result.payload;
  // The normalized payload's uuid is the trigger instance id, so each delivery is keyed by
  // its signed webhook id (or the body hash for unsigned deliveries) instead.
  const header = request.headers["webhook-id"];
  const webhookId = Array.isArray(header) ? header[0] : header;
  return {
    eventId: webhookId || createHash("sha256").update(request.body).digest("hex"),
    triggerId: p.id,
    triggerSlug: p.triggerSlug,
    toolkit: p.toolkitSlug,
    userId: p.userId,
    payload: p.payload ?? {},
  };
}

export async function registerWebhook(url: string) {
  return composio().triggers.setWebhookSubscription({ webhookUrl: url });
}
