import { logger } from "@viktor/config";
import { closeDb, runMigrations } from "@viktor/db";
import { closeQueues, closeRedis, work } from "@viktor/queue";
import { processAgentRun } from "./processors/agent-run.ts";

await runMigrations();

const workers = [work("agent-run", processAgentRun, { concurrency: 8, lockDuration: 60_000 })];

for (const w of workers) {
  w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"));
}
logger.info({ queues: workers.map((w) => w.name) }, "worker started");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "draining workers");
  await Promise.all(workers.map((w) => w.close()));
  await closeQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
