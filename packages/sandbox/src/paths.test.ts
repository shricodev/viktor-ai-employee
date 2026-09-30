import { describe, expect, it } from "vitest";
import { containerName, resolveWorkspacePath, truncate } from "./paths.ts";

describe("resolveWorkspacePath", () => {
  it("resolves relative paths under /workspace", () => {
    expect(resolveWorkspacePath("out/report.pdf")).toBe("/workspace/out/report.pdf");
    expect(resolveWorkspacePath("")).toBe("/workspace");
  });

  it("accepts absolute paths inside the workspace", () => {
    expect(resolveWorkspacePath("/workspace/a/../b.txt")).toBe("/workspace/b.txt");
  });

  it("rejects escapes", () => {
    expect(() => resolveWorkspacePath("../etc/passwd")).toThrow();
    expect(() => resolveWorkspacePath("/etc/passwd")).toThrow();
    expect(() => resolveWorkspacePath("/workspace-evil/x")).toThrow();
  });
});

describe("containerName", () => {
  it("produces docker-safe names", () => {
    expect(containerName("T0ABC_123")).toBe("viktor-sbx-t0abc-123");
  });
});

describe("truncate", () => {
  it("keeps short text and trims long text from the middle", () => {
    expect(truncate("short", 10)).toBe("short");
    const out = truncate("a".repeat(50) + "b".repeat(50), 20);
    expect(out.startsWith("a".repeat(14))).toBe(true);
    expect(out.endsWith("b".repeat(6))).toBe(true);
    expect(out).toContain("80 characters truncated");
  });
});
