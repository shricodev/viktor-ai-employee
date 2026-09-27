import { env } from "@viktor/config";
import { Redis } from "ioredis";

const connections: Redis[] = [];

export function createRedis(): Redis {
  const redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  connections.push(redis);
  return redis;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled(connections.splice(0).map((r) => r.quit()));
}
