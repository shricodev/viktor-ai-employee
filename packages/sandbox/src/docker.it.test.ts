import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  destroySandbox,
  execInSandbox,
  readSandboxFile,
  reapIdleSandboxes,
  writeSandboxFile,
} from "./docker.ts";

const enabled = process.env.SANDBOX_IT === "1";
const ws = `TEST${randomBytes(3).toString("hex")}`;

describe.skipIf(!enabled)(
  "docker sandbox (integration)",
  () => {
    afterAll(async () => {
      await destroySandbox(ws);
    });

    it("runs commands as an unprivileged user", async () => {
      const res = await execInSandbox(ws, "id -u && pwd");
      expect(res.exitCode).toBe(0);
      expect(res.stdout.trim().split("\n")).toEqual(["1000", "/workspace"]);
    });

    it("round-trips files through the workspace volume", async () => {
      await writeSandboxFile(ws, "data/in.csv", "a,b\n1,2\n");
      const res = await execInSandbox(
        ws,
        "python3 -c \"import pandas as pd; print(pd.read_csv('data/in.csv').sum().sum())\"",
      );
      expect(res.stdout.trim()).toBe("3");
      expect((await readSandboxFile(ws, "data/in.csv")).toString()).toContain("1,2");
    });

    it("cannot write outside the workspace or see host secrets", async () => {
      const res = await execInSandbox(ws, "touch /etc/x; echo $?; env | grep -c ANTHROPIC || true");
      expect(res.stdout.trim().split("\n")).toEqual(["1", "0"]);
    });

    it("keeps user-installed binaries on PATH", async () => {
      await execInSandbox(
        ws,
        "mkdir -p .local/bin && printf '#!/bin/sh\necho hi' > .local/bin/mytool && chmod +x .local/bin/mytool",
      );
      expect((await execInSandbox(ws, "mytool")).stdout.trim()).toBe("hi");
    });

    it("never reaps a sandbox that is running a command, and restarts after reaping", async () => {
      const busy = execInSandbox(ws, "sleep 3; echo done", { timeoutSec: 10 });
      await new Promise((r) => setTimeout(r, 1000));
      await reapIdleSandboxes(0);
      expect((await busy).stdout.trim()).toBe("done");
      expect(await reapIdleSandboxes(0)).toBeGreaterThanOrEqual(1);
      expect((await execInSandbox(ws, "cat data/in.csv")).stdout).toContain("1,2");
    });

    it("enforces timeouts", async () => {
      const res = await execInSandbox(ws, "sleep 10", { timeoutSec: 1 });
      expect(res.timedOut).toBe(true);
    });
  },
  120_000,
);
