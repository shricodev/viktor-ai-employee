import type { KnownBlock, WebClient } from "@slack/web-api";
import { logger } from "@viktor/config";
import { chunkText, markdownBlocks, plainPreview } from "./markdown.ts";

const MAX_STEPS = 5;
const MIN_UPDATE_INTERVAL_MS = 1_500;

/**
 * A single Slack message that shows live progress while the agent works and is
 * then replaced in place by the final answer.
 */
export class ProgressMessage {
  private ts?: string;
  private steps: string[] = [];
  private lastUpdate = 0;
  private pending?: NodeJS.Timeout;
  private finished = false;
  private inflight: Promise<unknown> = Promise.resolve();

  private readonly client: WebClient;
  private readonly channel: string;
  private readonly threadTs: string;

  constructor(client: WebClient, channel: string, threadTs: string) {
    this.client = client;
    this.channel = channel;
    this.threadTs = threadTs;
  }

  async start(label = "Working on it…"): Promise<void> {
    const res = await this.client.chat.postMessage({
      channel: this.channel,
      thread_ts: this.threadTs,
      text: label,
      blocks: this.progressBlocks(label),
    });
    this.ts = res.ts;
  }

  step(label: string): void {
    if (this.finished || this.steps.at(-1) === label) return;
    this.steps.push(label);
    this.schedule();
  }

  async finish(text: string, extraBlocks: KnownBlock[] = []): Promise<void> {
    this.finished = true;
    clearTimeout(this.pending);
    // A progress edit already on the wire must land before the answer, never after it.
    await this.inflight;
    const [first = "Done.", ...rest] = chunkText(text);
    const firstBlocks = [...markdownBlocks(first), ...(rest.length ? [] : extraBlocks)];
    if (this.ts) {
      await this.client.chat.update({
        channel: this.channel,
        ts: this.ts,
        text: plainPreview(first),
        blocks: firstBlocks,
      });
    } else {
      await this.post(first, firstBlocks);
    }
    for (const [i, chunk] of rest.entries()) {
      const last = i === rest.length - 1;
      await this.post(chunk, [...markdownBlocks(chunk), ...(last ? extraBlocks : [])]);
    }
  }

  async fail(message: string): Promise<void> {
    await this.finish(`:warning: ${message}`);
  }

  private async post(text: string, blocks: KnownBlock[]) {
    await this.client.chat.postMessage({
      channel: this.channel,
      thread_ts: this.threadTs,
      text: plainPreview(text),
      blocks,
    });
  }

  private schedule() {
    if (this.pending) return;
    const wait = Math.max(0, this.lastUpdate + MIN_UPDATE_INTERVAL_MS - Date.now());
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.flush();
    }, wait);
  }

  private async flush() {
    if (!this.ts || this.finished) return;
    this.lastUpdate = Date.now();
    const label = this.steps.at(-1) ?? "Working on it…";
    this.inflight = this.client.chat
      .update({
        channel: this.channel,
        ts: this.ts,
        text: label,
        blocks: this.progressBlocks(label),
      })
      .catch((err) => logger.warn({ err }, "progress update failed"));
    await this.inflight;
  }

  private progressBlocks(current: string): KnownBlock[] {
    const done = this.steps.slice(0, -1).slice(-(MAX_STEPS - 1));
    const lines = [
      ...done.map((s) => `:white_check_mark: ${s}`),
      `:hourglass_flowing_sand: ${current}`,
    ];
    return [{ type: "context", elements: [{ type: "mrkdwn", text: lines.join("\n") }] }];
  }
}
