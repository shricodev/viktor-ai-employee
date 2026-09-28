import { and, eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { threads } from "../schema.ts";

export type Thread = typeof threads.$inferSelect;

type ThreadKey = { workspaceId: string; channelId: string; threadTs: string };

export async function findThread(key: ThreadKey): Promise<Thread | undefined> {
  const [row] = await getDb()
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.workspaceId, key.workspaceId),
        eq(threads.channelId, key.channelId),
        eq(threads.threadTs, key.threadTs),
      ),
    );
  return row;
}

export async function ensureThread(key: ThreadKey): Promise<Thread> {
  const [row] = await getDb()
    .insert(threads)
    .values(key)
    .onConflictDoUpdate({
      target: [threads.workspaceId, threads.channelId, threads.threadTs],
      set: { updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function setThreadSession(id: string, sessionId: string | null): Promise<void> {
  await getDb().update(threads).set({ sessionId }).where(eq(threads.id, id));
}

export async function recordThreadCost(id: string, totalCostUsd: number): Promise<void> {
  await getDb().update(threads).set({ totalCostUsd }).where(eq(threads.id, id));
}
