import { describe, expect, it } from "vitest";
import { connectCard, titleCase } from "./blocks.ts";

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
