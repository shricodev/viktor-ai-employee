import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { destroySandbox, execInSandbox, readSandboxFile, writeSandboxFile } from "./docker.ts";

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

    it("enforces timeouts", async () => {
      const res = await execInSandbox(ws, "sleep 10", { timeoutSec: 1 });
      expect(res.timedOut).toBe(true);
    });
  },
  120_000,
);
