import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";
import { ProgressMessage } from "./progress.ts";

function fakeClient() {
  const landed: string[] = [];
  const client = {
    chat: {
      postMessage: vi.fn(async () => ({ ts: "1.0" })),
      update: vi.fn(async ({ text }: { text: string }) => {
        // Progress edits are slow; the final answer is fast.
        await new Promise((r) => setTimeout(r, text.startsWith("Step") ? 50 : 1));
        landed.push(text);
        return {};
      }),
    },
  };
  return { client: client as unknown as WebClient, landed };
}

describe("ProgressMessage", () => {
  it("never lets a progress edit land after the final answer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { client, landed } = fakeClient();
    const progress = new ProgressMessage(client, "C1", "1.0");
    await progress.start();
    progress.step("Step one");
    await new Promise((r) => setTimeout(r, 5));
    await progress.finish("All done");
    await new Promise((r) => setTimeout(r, 80));
    expect(landed.at(-1)).toBe("All done");
    vi.useRealTimers();
  });

  it("ignores steps after finishing", async () => {
    const { client, landed } = fakeClient();
    const progress = new ProgressMessage(client, "C1", "1.0");
    await progress.start();
    await progress.finish("Done");
    progress.step("Step late");
    await new Promise((r) => setTimeout(r, 1700));
    expect(landed).toEqual(["Done"]);
  });
});
