import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { triggerSubscriptions } from "../schema.ts";

export type TriggerSubscription = typeof triggerSubscriptions.$inferSelect;

export async function createTriggerSubscription(
  input: typeof triggerSubscriptions.$inferInsert,
): Promise<TriggerSubscription> {
  const [row] = await getDb().insert(triggerSubscriptions).values(input).returning();
  return row!;
}

export async function findTriggerByComposioId(
  composioTriggerId: string,
): Promise<TriggerSubscription | undefined> {
  const [row] = await getDb()
    .select()
    .from(triggerSubscriptions)
    .where(eq(triggerSubscriptions.composioTriggerId, composioTriggerId));
  return row;
}

export async function getTriggerSubscription(id: string): Promise<TriggerSubscription | undefined> {
  const [row] = await getDb()
    .select()
    .from(triggerSubscriptions)
    .where(eq(triggerSubscriptions.id, id));
  return row;
}

export async function listTriggerSubscriptions(
  workspaceId: string,
): Promise<TriggerSubscription[]> {
  return getDb()
    .select()
    .from(triggerSubscriptions)
    .where(eq(triggerSubscriptions.workspaceId, workspaceId))
    .orderBy(asc(triggerSubscriptions.createdAt));
}

export async function deleteTriggerSubscription(
  workspaceId: string,
  id: string,
): Promise<TriggerSubscription | undefined> {
  const [row] = await getDb()
    .delete(triggerSubscriptions)
    .where(and(eq(triggerSubscriptions.workspaceId, workspaceId), eq(triggerSubscriptions.id, id)))
    .returning();
  return row;
}

export async function markTriggerFired(id: string): Promise<void> {
  await getDb()
    .update(triggerSubscriptions)
    .set({ lastFiredAt: new Date() })
    .where(eq(triggerSubscriptions.id, id));
}
