import { describe, expect, it } from "vitest";
import { stripMention, toFileRefs } from "./text.ts";

describe("stripMention", () => {
  it("removes the bot mention and collapses whitespace", () => {
    expect(stripMention("<@U123>  summarize   this", "U123")).toBe("summarize this");
  });

  it("keeps mentions of other users", () => {
    expect(stripMention("<@U123> ping <@U999>", "U123")).toBe("ping <@U999>");
  });
});

describe("toFileRefs", () => {
  it("returns undefined when there are no downloadable files", () => {
    expect(toFileRefs(undefined)).toBeUndefined();
    expect(toFileRefs([{ id: "F1" }])).toBeUndefined();
  });

  it("maps slack files", () => {
    expect(
      toFileRefs([{ id: "F1", name: "a.csv", mimetype: "text/csv", url_private: "https://x", size: 3 }]),
    ).toEqual([{ id: "F1", name: "a.csv", mimetype: "text/csv", urlPrivate: "https://x", size: 3 }]);
  });
});
