import { describe, expect, it } from "vitest";
import { approvalCard, connectCard, titleCase } from "./blocks.ts";

describe("titleCase", () => {
  it("formats toolkit slugs", () => {
    expect(titleCase("googlesheets")).toBe("Googlesheets");
    expect(titleCase("google_drive")).toBe("Google Drive");
    expect(titleCase("MICROSOFT-TEAMS")).toBe("Microsoft Teams");
  });
});

describe("connectCard", () => {
  it("renders a url button per toolkit", () => {
    const blocks = connectCard([
      { toolkit: "gmail", url: "https://a" },
      { toolkit: "github", url: "https://b" },
    ]);
    const actions = blocks.find((b) => b.type === "actions");
    expect(actions && "elements" in actions && actions.elements).toHaveLength(2);
    expect(JSON.stringify(blocks)).toContain("Connect Gmail");
  });
});

describe("approvalCard", () => {
  it("shows each call and the decision buttons", () => {
    const blocks = approvalCard({
      id: "a1",
      requestedBy: "U1",
      calls: [{ action: "GMAIL_SEND_EMAIL", args: { to: "x@y.z" } }],
      canAlwaysAllow: true,
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain("Gmail Send Email");
    expect(text).toContain("x@y.z");
    expect(text).toContain("approval_approve");
    expect(text).toContain("approval_always");
  });

  it("truncates huge arguments", () => {
    const blocks = approvalCard({
      id: "a1",
      calls: [{ action: "X", args: { body: "z".repeat(10_000) } }],
      canAlwaysAllow: false,
    });
    for (const b of blocks) {
      if (b.type === "section" && b.text) expect(b.text.text.length).toBeLessThan(3000);
    }
  });
});
