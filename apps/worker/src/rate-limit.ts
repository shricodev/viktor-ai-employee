import { createRedis } from "@viktor/queue";
import type { Redis } from "ioredis";

let redis: Redis | undefined;

/** Fixed-window counter; returns false once `limit` hits within the window. */
export async function withinRate(key: string, limit: number, windowSec: number): Promise<boolean> {
  redis ??= createRedis();
  const bucket = `rate:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSec);
  return count <= limit;
}
