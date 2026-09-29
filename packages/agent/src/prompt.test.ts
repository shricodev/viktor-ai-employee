import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildTurnContext } from "./prompt.ts";

describe("buildSystemPrompt", () => {
  it("keeps workspace specifics after the cache boundary", () => {
    const [core, boundary, local] = buildSystemPrompt({
      name: "Acme",
      persona: "Use British spelling.",
    });
    expect(core).not.toContain("Acme");
    expect(boundary).toBe(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
    expect(local).toContain("Workspace: Acme");
    expect(local).toContain("Use British spelling.");
  });

  it("omits the preferences section without a persona", () => {
    expect(buildSystemPrompt({ name: "Acme" }).join("\n")).not.toContain("Team preferences");
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
