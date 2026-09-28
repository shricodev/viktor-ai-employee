import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildTurnContext } from "./prompt.ts";

describe("buildSystemPrompt", () => {
  it("includes the workspace name and optional persona", () => {
    const prompt = buildSystemPrompt({ name: "Acme", persona: "Use British spelling." });
    expect(prompt).toContain('"Acme" Slack workspace');
    expect(prompt).toContain("Use British spelling.");
  });

  it("omits the preferences section without a persona", () => {
    expect(buildSystemPrompt({ name: "Acme" })).not.toContain("Team preferences");
  });
});

describe("buildTurnContext", () => {
  it("renders time in the workspace timezone and skips empty sections", () => {
    const ctx = buildTurnContext({
      now: new Date("2026-03-02T09:00:00Z"),
      timezone: "Asia/Kathmandu",
      requesterId: "U1",
      channelId: "C1",
      trigger: "mention",
      sections: [
        { title: "Memories", body: "- fiscal year starts in April" },
        { title: "Skills", body: "  " },
      ],
    });
    expect(ctx).toContain("2:45 PM");
    expect(ctx).toContain("from <@U1>");
    expect(ctx).toContain("## Memories");
    expect(ctx).not.toContain("## Skills");
  });
});
