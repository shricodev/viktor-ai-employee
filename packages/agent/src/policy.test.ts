import { describe, expect, it } from "vitest";
import { decide, isReadOnlySlug } from "./policy.ts";

describe("isReadOnlySlug", () => {
  it.each([
    ["GMAIL_FETCH_EMAILS", true],
    ["GITHUB_LIST_PULL_REQUESTS", true],
    ["GOOGLESHEETS_GET_SPREADSHEET_INFO", true],
    ["GMAIL_CREATE_EMAIL_DRAFT", true],
    ["GMAIL_SEND_EMAIL", false],
    ["GMAIL_SEND_DRAFT", false],
    ["GOOGLESHEETS_BATCH_UPDATE", false],
    ["LINEAR_CREATE_LINEAR_ISSUE", false],
    ["HUBSPOT_SEARCH_AND_UPDATE_CONTACT", false],
    ["SOMETHING_WEIRD", false],
  ])("%s → %s", (slug, expected) => {
    expect(isReadOnlySlug(slug)).toBe(expected);
  });
});

describe("decide", () => {
  it("allows own tools and safe built-ins", () => {
    expect(decide("mcp__viktor__sandbox_exec", {})).toEqual({ action: "allow" });
    expect(decide("WebSearch", {})).toEqual({ action: "allow" });
  });

  it("allows composio discovery and connection meta tools", () => {
    expect(decide("mcp__composio__COMPOSIO_SEARCH_TOOLS", {})).toEqual({ action: "allow" });
    expect(decide("mcp__composio__COMPOSIO_MANAGE_CONNECTIONS", {})).toEqual({ action: "allow" });
  });

  it("gates multi-execute calls that contain writes", () => {
    const input = {
      tools: [
        { tool_slug: "GMAIL_FETCH_EMAILS", arguments: {} },
        { tool_slug: "GMAIL_SEND_EMAIL", arguments: { to: "a@b.c" } },
      ],
    };
    expect(decide("mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL", input)).toEqual({
      action: "approve",
      actions: ["GMAIL_SEND_EMAIL"],
    });
  });

  it("respects auto-approved slugs", () => {
    const input = { tools: [{ tool_slug: "SLACK_SEND_MESSAGE" }] };
    expect(
      decide("mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL", input, {
        autoApproved: ["slack_send_message"],
      }),
    ).toEqual({ action: "allow" });
  });

  it("only lets GET through the proxy", () => {
    expect(decide("mcp__composio__COMPOSIO_PROXY_EXECUTE", { method: "get" })).toEqual({
      action: "allow",
    });
    expect(decide("mcp__composio__COMPOSIO_PROXY_EXECUTE", { method: "DELETE" }).action).toBe(
      "approve",
    );
  });

  it("gates unknown tools", () => {
    expect(decide("Bash", {}).action).toBe("approve");
    expect(decide("mcp__other__do_thing", {}).action).toBe("approve");
  });
});
