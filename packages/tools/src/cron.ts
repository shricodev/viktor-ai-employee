import { CronExpressionParser } from "cron-parser";

export const MIN_INTERVAL_MINUTES = 15;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function nextRuns(cron: string, timezone: string, count: number, from = new Date()): Date[] {
  const expr = CronExpressionParser.parse(cron, { tz: timezone, currentDate: from });
  return Array.from({ length: count }, () => expr.next().toDate());
}

/** Returns an error message, or null when the cron expression is acceptable. */
export function validateCron(cron: string, timezone: string): string | null {
  if (!isValidTimezone(timezone)) return `Unknown timezone "${timezone}"`;
  if (cron.trim().split(/\s+/).length !== 5) {
    return "Use a standard 5-field cron expression (minute hour day-of-month month day-of-week).";
  }
  let runs: Date[];
  try {
    runs = nextRuns(cron, timezone, 6);
  } catch (err) {
    return `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}`;
  }
  for (let i = 1; i < runs.length; i++) {
    const gap = (runs[i]!.getTime() - runs[i - 1]!.getTime()) / 60_000;
    if (gap < MIN_INTERVAL_MINUTES) {
      return `Schedules can run at most every ${MIN_INTERVAL_MINUTES} minutes.`;
    }
  }
  return null;
}

export function formatRun(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);
}
