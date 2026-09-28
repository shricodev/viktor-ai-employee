import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export type WorkspaceSettings = {
  proactiveChannels?: string[];
  autoApprovedTools?: string[];
  persona?: string;
};

export const workspaces = pgTable("workspaces", {
  id: text().primaryKey(),
  enterpriseId: text(),
  name: text().notNull(),
  botUserId: text().notNull(),
  botId: text(),
  installerUserId: text().notNull(),
  installation: text().notNull(),
  timezone: text().notNull().default("UTC"),
  monthlyBudgetUsd: numeric({ precision: 10, scale: 2, mode: "number" }),
  settings: jsonb().$type<WorkspaceSettings>().notNull().default({}),
  uninstalledAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const threads = pgTable(
  "threads",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: text().notNull(),
    threadTs: text().notNull(),
    sessionId: text(),
    totalCostUsd: numeric({ precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.workspaceId, t.channelId, t.threadTs)],
);

export const runTrigger = pgEnum("run_trigger", [
  "mention",
  "dm",
  "schedule",
  "event",
  "proactive",
]);
export const runStatus = pgEnum("run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const runs = pgTable(
  "runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid().references(() => threads.id, { onDelete: "set null" }),
    trigger: runTrigger().notNull(),
    status: runStatus().notNull().default("queued"),
    requestedBy: text(),
    prompt: text().notNull(),
    result: text(),
    error: text(),
    model: text(),
    numTurns: integer(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.workspaceId, t.createdAt),
    index().on(t.status).where(sql`${t.status} in ('queued', 'running')`),
  ],
);

export const agentSessionEntries = pgTable(
  "agent_session_entries",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    projectKey: text().notNull(),
    sessionId: text().notNull(),
    subpath: text().notNull().default(""),
    uuid: text(),
    entry: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.projectKey, t.sessionId, t.subpath, t.seq),
    uniqueIndex()
      .on(t.projectKey, t.sessionId, t.subpath, t.uuid)
      .where(sql`${t.uuid} is not null`),
  ],
);
