import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.ts";

const k = randomBytes(32).toString("hex");

describe("crypto", () => {
  it("round-trips", () => {
    const secret = JSON.stringify({ bot: { token: "xoxb-123" } });
    expect(decrypt(encrypt(secret, k), k)).toBe(secret);
  });

  it("uses a fresh iv per call", () => {
    expect(encrypt("same", k)).not.toBe(encrypt("same", k));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encrypt("hello", k).split(":");
    parts[3] = Buffer.from("jello").toString("base64");
    expect(() => decrypt(parts.join(":"), k)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("hello", k), randomBytes(32).toString("hex"))).toThrow();
  });
});
