import { describe, expect, it } from "vitest";
import { chunkText, plainPreview } from "./markdown.ts";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkText("hello")).toEqual(["hello"]);
  });

  it("splits on paragraph boundaries when possible", () => {
    const a = "a".repeat(60);
    const b = "b".repeat(60);
    expect(chunkText(`${a}\n\n${b}`, 100)).toEqual([a, b]);
  });

  it("hard-splits text without whitespace", () => {
    const chunks = chunkText("x".repeat(250), 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("never loses content", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${"z".repeat(i)}`).join("\n");
    expect(chunkText(text, 200).join("\n").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});

describe("plainPreview", () => {
  it("strips markdown and links", () => {
    expect(plainPreview("**Done!** See [the report](https://x.y)")).toBe("Done! See the report");
  });

  it("keeps Slack mentions and escapes stray angle brackets", () => {
    expect(plainPreview("Posting in <#C123> as `<sender> — <subject>`")).toBe(
      "Posting in <#C123> as &lt;sender&gt; — &lt;subject&gt;",
    );
  });

  it("drops heading and quote markers but keeps hashtags", () => {
    expect(plainPreview("## Summary\n> quoted\nTicket #42")).toBe("Summary quoted Ticket #42");
  });

  it("truncates", () => {
    expect(plainPreview("word ".repeat(100), 20)).toHaveLength(20);
  });
});
