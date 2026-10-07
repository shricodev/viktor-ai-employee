import { describe, expect, it } from "vitest";
import { buildHomeView, type HomeData } from "./view.ts";

const base: HomeData = {
  isAdmin: true,
  name: "Acme",
  timezone: "UTC",
  budgetUsd: 100,
  spendUsd: 25,
  runsThisMonth: 12,
  connections: [{ slug: "gmail", name: "Gmail" }],
  proactiveChannels: ["C1"],
  schedules: [{ id: "s1", name: "Weekly KPIs", cron: "0 9 * * 1", channelId: "C2", enabled: true }],
  triggers: [{ id: "t1", triggerSlug: "GITHUB_ISSUE_ADDED_EVENT", channelId: "C3" }],
  memoryCount: 3,
  recentMemories: [{ id: "m1", content: "Fiscal year starts in April" }],
  skills: [{ name: "weekly-kpis", description: "How to build the KPI report" }],
  autoApproved: ["SLACK_SEND_MESSAGE"],
};

const actionIds = (data: HomeData) =>
  JSON.stringify(buildHomeView(data)).match(/home_[a-z_]+/g) ?? [];

describe("buildHomeView", () => {
  it("renders usage and lists", () => {
    const json = JSON.stringify(buildHomeView(base));
    expect(json).toContain("$25.00");
    expect(json).toContain("25%");
    expect(json).toContain("Gmail");
    expect(json).toContain("Weekly KPIs");
    expect(json).toContain("Github Issue Added Event");
  });

  it("shows admin controls only to admins", () => {
    expect(actionIds(base)).toEqual(
      expect.arrayContaining([
        "home_settings",
        "home_watch_channels",
        "home_wipe",
        "home_memory_forget",
      ]),
    );
    const member = new Set(actionIds({ ...base, isAdmin: false }));
    expect([...member]).toEqual(["home_connect"]);
  });

  it("stays within slack's block limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, content: "x" }));
    expect(buildHomeView({ ...base, recentMemories: many }).blocks.length).toBeLessThanOrEqual(100);
  });
});
