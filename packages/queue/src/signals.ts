import type { Redis } from "ioredis";
import { createRedis } from "./connection.ts";

export type ApprovalOutcome = "approved" | "denied" | "expired";

const CHANNEL = "viktor:approvals";

let publisher: Redis | undefined;
let subscriber: Redis | undefined;
let subscribed: Promise<unknown> | undefined;
const waiters = new Map<string, (outcome: ApprovalOutcome) => void>();

function ensureSubscriber(): Promise<unknown> {
  if (subscribed) return subscribed;
  subscriber = createRedis();
  subscribed = subscriber.subscribe(CHANNEL);
  subscriber.on("message", (_channel, raw: string) => {
    const { id, outcome } = JSON.parse(raw) as { id: string; outcome: ApprovalOutcome };
    waiters.get(id)?.(outcome);
  });
  return subscribed;
}

export async function publishApproval(id: string, outcome: ApprovalOutcome): Promise<void> {
  publisher ??= createRedis();
  await publisher.publish(CHANNEL, JSON.stringify({ id, outcome }));
}

/**
 * Resolves when someone decides on the approval, the timeout passes ("expired"), or the
 * signal aborts. `alreadyDecided` closes the race where the click lands before we subscribe.
 */
export function waitForApproval(
  id: string,
  timeoutMs: number,
  signal: AbortSignal,
  alreadyDecided: () => Promise<ApprovalOutcome | null>,
): Promise<ApprovalOutcome> {
  if (signal.aborted) return Promise.resolve("expired");
  const ready = ensureSubscriber();
  return new Promise((resolve) => {
    const done = (outcome: ApprovalOutcome) => {
      clearTimeout(timer);
      waiters.delete(id);
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = () => done("expired");
    const timer = setTimeout(() => done("expired"), timeoutMs);
    waiters.set(id, done);
    signal.addEventListener("abort", onAbort, { once: true });
    // Only check the database once the subscription is live, so no decision falls in between.
    ready.then(alreadyDecided).then(
      (outcome) => outcome && done(outcome),
      () => undefined,
    );
  });
}
