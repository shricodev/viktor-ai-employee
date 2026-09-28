import type { SessionKey, SessionStore, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import { agentSessionEntries, and, asc, eq, getDb, max, sql } from "@viktor/db";

function where(key: SessionKey) {
  return and(
    eq(agentSessionEntries.projectKey, key.projectKey),
    eq(agentSessionEntries.sessionId, key.sessionId),
    eq(agentSessionEntries.subpath, key.subpath ?? ""),
  );
}

/** Mirrors Agent SDK transcripts into Postgres so any worker can resume any thread. */
export const postgresSessionStore: SessionStore = {
  async append(key, entries) {
    if (!entries.length) return;
    await getDb()
      .insert(agentSessionEntries)
      .values(
        entries.map((entry) => ({
          projectKey: key.projectKey,
          sessionId: key.sessionId,
          subpath: key.subpath ?? "",
          uuid: entry.uuid ?? null,
          entry,
        })),
      )
      .onConflictDoNothing();
  },

  async load(key) {
    const rows = await getDb()
      .select({ entry: agentSessionEntries.entry })
      .from(agentSessionEntries)
      .where(where(key))
      .orderBy(asc(agentSessionEntries.seq));
    return rows.length ? rows.map((r) => r.entry as SessionStoreEntry) : null;
  },

  async listSessions(projectKey) {
    const rows = await getDb()
      .select({
        sessionId: agentSessionEntries.sessionId,
        mtime: max(agentSessionEntries.createdAt),
      })
      .from(agentSessionEntries)
      .where(eq(agentSessionEntries.projectKey, projectKey))
      .groupBy(agentSessionEntries.sessionId);
    return rows.map((r) => ({ sessionId: r.sessionId, mtime: r.mtime?.getTime() ?? 0 }));
  },

  async listSubkeys(key) {
    const rows = await getDb()
      .selectDistinct({ subpath: agentSessionEntries.subpath })
      .from(agentSessionEntries)
      .where(
        and(
          eq(agentSessionEntries.projectKey, key.projectKey),
          eq(agentSessionEntries.sessionId, key.sessionId),
          sql`${agentSessionEntries.subpath} <> ''`,
        ),
      );
    return rows.map((r) => r.subpath);
  },

  async delete(key) {
    await getDb().delete(agentSessionEntries).where(where(key));
  },
};
