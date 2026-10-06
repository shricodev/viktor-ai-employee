import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
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
  vector,
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
  checkinChannelId?: string;
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
  composioSessionId: text(),
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

export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "denied",
  "expired",
]);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid().references(() => runs.id, { onDelete: "set null" }),
    toolName: text().notNull(),
    toolInput: jsonb().notNull(),
    actions: jsonb().$type<string[]>().notNull().default([]),
    status: approvalStatus().notNull().default("pending"),
    requestedBy: text(),
    channelId: text().notNull(),
    threadTs: text().notNull(),
    messageTs: text(),
    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.workspaceId, t.createdAt)],
);

export const EMBEDDING_DIMENSIONS = 1024;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const memories = pgTable(
  "memories",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    content: text().notNull(),
    tags: text().array().notNull().default([]),
    createdBy: text(),
    sourceChannelId: text(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    search: tsvector().generatedAlwaysAs(sql`to_tsvector('english', content)`),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.createdAt),
    index("memories_search_idx").using("gin", t.search),
    index("memories_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull(),
    body: text().notNull(),
    createdBy: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.workspaceId, t.name)],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    cron: text().notNull(),
    timezone: text().notNull(),
    prompt: text().notNull(),
    channelId: text().notNull(),
    createdBy: text(),
    enabled: boolean().notNull().default(true),
    lastRunAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId)],
);

export const triggerSubscriptions = pgTable(
  "trigger_subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    composioTriggerId: text().notNull(),
    triggerSlug: text().notNull(),
    triggerConfig: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    instruction: text().notNull(),
    channelId: text().notNull(),
    createdBy: text(),
    enabled: boolean().notNull().default(true),
    lastFiredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.composioTriggerId), index().on(t.workspaceId)],
);
