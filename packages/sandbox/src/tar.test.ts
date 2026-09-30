import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { packFile, unpackFirstFile } from "./tar.ts";

describe("tar helpers", () => {
  it("round-trips a file", async () => {
    const archive = await packFile("hello.txt", Buffer.from("hi there"));
    const out = await unpackFirstFile(Readable.from([archive]), 1024);
    expect(out.toString()).toBe("hi there");
  });

  it("enforces the size limit", async () => {
    const archive = await packFile("big.bin", Buffer.alloc(2048));
    await expect(unpackFirstFile(Readable.from([archive]), 1024)).rejects.toThrow(/limit/);
  });
});
