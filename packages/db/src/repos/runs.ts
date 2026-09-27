import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../client.ts";
import { runs } from "../schema.ts";

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export async function createRun(input: NewRun): Promise<Run> {
  const [row] = await getDb().insert(runs).values(input).returning();
  return row!;
}

export async function getRun(id: string): Promise<Run | undefined> {
  const [row] = await getDb().select().from(runs).where(eq(runs.id, id));
  return row;
}

export async function startRun(id: string, patch: Partial<NewRun> = {}): Promise<void> {
  await getDb()
    .update(runs)
    .set({ ...patch, status: "running", startedAt: new Date() })
    .where(eq(runs.id, id));
}

export type RunOutcome = Pick<
  NewRun,
  | "result"
  | "error"
  | "numTurns"
  | "inputTokens"
  | "outputTokens"
  | "cacheReadTokens"
  | "cacheWriteTokens"
  | "costUsd"
>;

export async function finishRun(
  id: string,
  status: "succeeded" | "failed" | "cancelled",
  outcome: RunOutcome,
): Promise<void> {
  await getDb()
    .update(runs)
    .set({ ...outcome, status, finishedAt: new Date() })
    .where(eq(runs.id, id));
}

export async function spendSince(workspaceId: string, since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${runs.costUsd}), 0)` })
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), gte(runs.createdAt, since)));
  return Number(row?.total ?? 0);
}
