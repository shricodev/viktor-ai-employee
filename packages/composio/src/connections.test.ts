import { describe, expect, it } from "vitest";
import { extractConnectLinks } from "./connections.ts";

describe("extractConnectLinks", () => {
  it("finds redirect urls with their toolkit", () => {
    const payload = {
      data: {
        results: {
          gmail: {
            toolkit: "GMAIL",
            status: "initiated",
            redirect_url: "https://connect.composio.dev/a",
          },
          github: { toolkit: "github", status: "active" },
        },
      },
    };
    expect(extractConnectLinks(payload)).toEqual([
      { toolkit: "gmail", url: "https://connect.composio.dev/a" },
    ]);
  });

  it("uses the parent key as toolkit when the entry omits it", () => {
    const payload = { results: { notion: { redirect_url: "https://connect.composio.dev/n" } } };
    expect(extractConnectLinks(payload)).toEqual([
      { toolkit: "notion", url: "https://connect.composio.dev/n" },
    ]);
  });

  it("parses json embedded in mcp text content", () => {
    const content = [
      {
        type: "text",
        text: JSON.stringify({ toolkit: "slack", redirectUrl: "https://connect.composio.dev/s" }),
      },
    ];
    expect(extractConnectLinks(content)).toEqual([
      { toolkit: "slack", url: "https://connect.composio.dev/s" },
    ]);
  });

  it("ignores non-https urls and dedupes", () => {
    const payload = [
      { toolkit: "x", redirect_url: "http://insecure" },
      { toolkit: "y", redirect_url: "https://connect.composio.dev/y" },
      { toolkit: "y", redirect_url: "https://connect.composio.dev/y" },
    ];
    expect(extractConnectLinks(payload)).toHaveLength(1);
  });
});
