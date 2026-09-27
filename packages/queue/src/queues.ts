import { type JobsOptions, Queue, type Processor, Worker, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import { createRedis } from "./connection.ts";
import type { JobMap, QueueName } from "./jobs.ts";

const defaults: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

let shared: Redis | undefined;
const queues = new Map<QueueName, Queue>();

export function queue<N extends QueueName>(name: N): Queue<JobMap[N]> {
  shared ??= createRedis();
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: shared, defaultJobOptions: defaults });
    queues.set(name, q);
  }
  return q as Queue<JobMap[N]>;
}

export function enqueue<N extends QueueName>(
  name: N,
  data: JobMap[N],
  opts?: JobsOptions,
): Promise<unknown> {
  const q = queue(name) as unknown as Queue;
  return q.add(name, data, opts);
}

export function work<N extends QueueName>(
  name: N,
  processor: Processor<JobMap[N]>,
  opts: Omit<WorkerOptions, "connection"> = {},
): Worker<JobMap[N]> {
  return new Worker(name, processor, { connection: createRedis(), ...opts });
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
