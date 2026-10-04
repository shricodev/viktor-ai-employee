import { describe, expect, it } from "vitest";
import { nextRuns, validateCron } from "./cron.ts";

describe("validateCron", () => {
  it("accepts common schedules", () => {
    expect(validateCron("0 9 * * 1-5", "America/New_York")).toBeNull();
    expect(validateCron("*/30 * * * *", "UTC")).toBeNull();
  });

  it("rejects schedules that fire too often", () => {
    expect(validateCron("*/5 * * * *", "UTC")).toMatch(/every 15 minutes/);
  });

  it("rejects malformed input", () => {
    expect(validateCron("every monday", "UTC")).toMatch(/5-field/);
    expect(validateCron("61 * * * *", "UTC")).toMatch(/Invalid cron/);
    expect(validateCron("0 9 * * *", "Mars/Olympus")).toMatch(/timezone/);
  });
});

describe("nextRuns", () => {
  it("respects the timezone", () => {
    const [run] = nextRuns("0 9 * * *", "Asia/Kathmandu", 1, new Date("2026-03-02T00:00:00Z"));
    expect(run?.toISOString()).toBe("2026-03-02T03:15:00.000Z");
  });
});
