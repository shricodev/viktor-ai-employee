import type { Redis } from "ioredis";
import { createRedis } from "./connection.ts";

export type ApprovalOutcome = "approved" | "denied" | "expired";

const CHANNEL = "viktor:approvals";

let publisher: Redis | undefined;
let subscriber: Redis | undefined;
const waiters = new Map<string, (outcome: ApprovalOutcome) => void>();

function ensureSubscriber(): Redis {
  if (subscriber) return subscriber;
  subscriber = createRedis();
  void subscriber.subscribe(CHANNEL);
  subscriber.on("message", (_channel, raw: string) => {
    const { id, outcome } = JSON.parse(raw) as { id: string; outcome: ApprovalOutcome };
    waiters.get(id)?.(outcome);
  });
  return subscriber;
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
  ensureSubscriber();
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
    void alreadyDecided().then((outcome) => outcome && done(outcome));
  });
}
