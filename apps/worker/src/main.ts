import { env, logger } from "@viktor/config";
import { closeDb, runMigrations } from "@viktor/db";
import { closeQueues, closeRedis, work } from "@viktor/queue";
import { reapIdleSandboxes } from "@viktor/sandbox";
import { processAgentRun } from "./processors/agent-run.ts";
import { processChannelMessage } from "./processors/channel-message.ts";
import { processScheduledRun, reconcileSchedules } from "./processors/scheduled-run.ts";
import { processTriggerEvent } from "./processors/trigger-event.ts";

await runMigrations();

const workers = [
  work("agent-run", processAgentRun, { concurrency: 8, lockDuration: 60_000 }),
  work("scheduled-run", processScheduledRun, { concurrency: 4, lockDuration: 60_000 }),
  work("trigger-event", processTriggerEvent, { concurrency: 4, lockDuration: 60_000 }),
  work("channel-message", processChannelMessage, { concurrency: 8, lockDuration: 60_000 }),
];

for (const w of workers) {
  w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"));
}
logger.info({ queues: workers.map((w) => w.name) }, "worker started");
logger.info({ count: await reconcileSchedules() }, "schedules reconciled");

const idleMs = env().SANDBOX_IDLE_MINUTES * 60_000;
const reaper = setInterval(() => {
  reapIdleSandboxes(idleMs)
    .then((n) => n && logger.info({ stopped: n }, "stopped idle sandboxes"))
    .catch((err) => logger.warn({ err }, "sandbox reaper failed"));
}, 60_000);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "draining workers");
  clearInterval(reaper);
  await Promise.all(workers.map((w) => w.close()));
  await closeQueues();
  await closeRedis();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
