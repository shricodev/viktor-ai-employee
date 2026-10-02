import { describe, expect, it } from "vitest";
import { fuseRankings } from "./memories.ts";

const item = (id: string) => ({ id });

describe("fuseRankings", () => {
  it("rewards items that rank well in several lists", () => {
    const fused = fuseRankings(
      [
        [item("a"), item("b"), item("c")],
        [item("b"), item("d"), item("e")],
      ],
      3,
    );
    expect(fused.map((i) => i.id)).toEqual(["b", "a", "d"]);
  });

  it("handles empty lists and limits", () => {
    expect(fuseRankings([[], [item("x"), item("y")]], 1)).toEqual([item("x")]);
    expect(fuseRankings([], 5)).toEqual([]);
  });
});
