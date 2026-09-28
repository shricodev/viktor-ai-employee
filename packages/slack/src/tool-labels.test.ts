import { describe, expect, it } from "vitest";
import { describeTool } from "./tool-labels.ts";

describe("describeTool", () => {
  it("labels built-in tools", () => {
    expect(describeTool("WebSearch", { query: "q3 revenue" })).toBe("Searching the web: q3 revenue");
    expect(describeTool("TodoWrite")).toBe("Planning");
  });

  it("humanizes mcp tool names", () => {
    expect(describeTool("mcp__viktor__remember")).toBe("Remember");
    expect(describeTool("mcp__composio__GMAIL_FETCH_EMAILS")).toBe("Gmail fetch emails");
  });

  it("lists nested tool slugs for batch executors", () => {
    expect(
      describeTool("mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL", {
        tools: [{ tool_slug: "GMAIL_SEND_EMAIL" }, { tool_slug: "SLACK_SEND_MESSAGE" }],
      }),
    ).toBe("Gmail send email, Slack send message");
  });
});
