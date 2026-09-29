import { randomUUID } from "node:crypto";
import { createRedis } from "@viktor/queue";
import type { Redis } from "ioredis";

let redis: Redis | undefined;

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Returns a release function, or null when another worker already holds the lock. */
export async function tryLock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  redis ??= createRedis();
  const token = randomUUID();
  const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
  if (!ok) return null;
  return async () => {
    await redis!.eval(RELEASE, 1, `lock:${key}`, token);
  };
}
