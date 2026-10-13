import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../client.ts";
import { memories } from "../schema.ts";

export type Memory = typeof memories.$inferSelect;
export type MemoryHit = Pick<Memory, "id" | "content" | "tags" | "createdAt" | "createdBy">;

const columns = {
  id: memories.id,
  content: memories.content,
  tags: memories.tags,
  createdAt: memories.createdAt,
  createdBy: memories.createdBy,
};

export async function addMemory(input: {
  workspaceId: string;
  content: string;
  tags?: string[];
  createdBy?: string;
  sourceChannelId?: string;
  embedding?: number[] | null;
}): Promise<Memory> {
  const [row] = await getDb()
    .insert(memories)
    .values({ ...input, tags: input.tags ?? [], embedding: input.embedding ?? null })
    .returning();
  return row!;
}

export async function deleteMemory(workspaceId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(memories)
    .where(and(eq(memories.workspaceId, workspaceId), eq(memories.id, id)))
    .returning({ id: memories.id });
  return rows.length > 0;
}

export async function recentMemories(workspaceId: string, limit = 20): Promise<MemoryHit[]> {
  return getDb()
    .select(columns)
    .from(memories)
    .where(eq(memories.workspaceId, workspaceId))
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function countMemories(workspaceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(memories)
    .where(eq(memories.workspaceId, workspaceId));
  return row?.n ?? 0;
}

/** Reciprocal rank fusion: merges ranked lists without needing comparable scores. */
export function fuseRankings<T extends { id: string }>(lists: T[][], limit: number, k = 60): T[] {
  const scores = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const entry = scores.get(item.id) ?? { item, score: 0 };
      entry.score += 1 / (k + rank + 1);
      scores.set(item.id, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.item);
}

/** Hybrid search: full-text always, plus vector similarity when a query embedding is available. */
export async function searchMemories(input: {
  workspaceId: string;
  query: string;
  embedding?: number[] | null;
  limit?: number;
}): Promise<MemoryHit[]> {
  const limit = input.limit ?? 8;
  const db = getDb();
  // Match any term, not all of them: a question often touches several separate memories.
  const tsquery = sql`replace(plainto_tsquery('english', ${input.query})::text, ' & ', ' | ')::tsquery`;

  const lexical = db
    .select(columns)
    .from(memories)
    .where(and(eq(memories.workspaceId, input.workspaceId), sql`${memories.search} @@ ${tsquery}`))
    .orderBy(desc(sql`ts_rank(${memories.search}, ${tsquery})`))
    .limit(limit * 2);

  const semantic = input.embedding
    ? db
        .select(columns)
        .from(memories)
        .where(and(eq(memories.workspaceId, input.workspaceId), isNotNull(memories.embedding)))
        .orderBy(cosineDistance(memories.embedding, input.embedding))
        .limit(limit * 2)
    : Promise.resolve([] as MemoryHit[]);

  const [a, b] = await Promise.all([lexical, semantic]);
  return fuseRankings([b, a], limit);
}
