import { env, logger } from "@viktor/config";
import { closeDb, runMigrations } from "@viktor/db";
import { closeQueues, closeRedis } from "@viktor/queue";
import { createSlackApp } from "./app.ts";

const { app } = createSlackApp();
await runMigrations();
await app.start(env().PORT);
logger.info({ port: env().PORT, url: env().PUBLIC_URL }, "gateway listening");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down");
  await app.stop();
  await closeQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
