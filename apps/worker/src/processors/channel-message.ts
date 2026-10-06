import { triageMessage } from "@viktor/agent";
import { logger } from "@viktor/config";
import { addMemory, createRun, ensureThread, findThread, getWorkspace } from "@viktor/db";
import type { ChannelMessageJob } from "@viktor/queue";
import { slackFor } from "@viktor/slack";
import { embed } from "@viktor/tools";
import type { Job } from "bullmq";
import { withinRate } from "../rate-limit.ts";
import { runTurn } from "../turn.ts";

const MAX_TRIAGE_PER_HOUR = 120;
const MAX_REPLIES_PER_HOUR = 6;

export async function processChannelMessage(job: Job<ChannelMessageJob>): Promise<void> {
  const msg = job.data;
  const workspace = await getWorkspace(msg.workspaceId);
  if (!workspace || workspace.uninstalledAt) return;
  if (!workspace.settings.proactiveChannels?.includes(msg.channelId)) return;
  if (!msg.text.trim()) return;
  if (!(await withinRate(`triage:${msg.channelId}`, MAX_TRIAGE_PER_HOUR, 3600))) return;

  const slack = await slackFor(workspace.id);
  const history = await slack.conversations
    .history({ channel: msg.channelId, latest: msg.ts, limit: 10, inclusive: false })
    .catch(() => null);
  const recent = (history?.messages ?? [])
    .reverse()
    .map((m) => `<@${m.user ?? m.bot_id ?? "unknown"}>: ${(m.text ?? "").slice(0, 500)}`)
    .join("\n");

  const triage = await triageMessage({
    workspaceName: workspace.name,
    recent,
    message: `<@${msg.userId}>: ${msg.text.slice(0, 4000)}`,
  });
  logger.debug({ channelId: msg.channelId, triage }, "triaged channel message");

  if (triage.action === "remember" && triage.memory) {
    await addMemory({
      workspaceId: workspace.id,
      content: triage.memory,
      createdBy: msg.userId,
      sourceChannelId: msg.channelId,
      tags: ["observed"],
      embedding: await embed(triage.memory, "document"),
    });
    await slack.reactions
      .add({ channel: msg.channelId, timestamp: msg.ts, name: "brain" })
      .catch(() => undefined);
    return;
  }

  if (triage.action !== "respond") return;
  if (!(await withinRate(`proactive:${msg.channelId}`, MAX_REPLIES_PER_HOUR, 3600))) return;

  const threadTs = msg.threadTs ?? msg.ts;
  // Someone may have mentioned Viktor in the meantime; that run takes precedence.
  if (await findThread({ workspaceId: workspace.id, channelId: msg.channelId, threadTs })) return;

  const thread = await ensureThread({
    workspaceId: workspace.id,
    channelId: msg.channelId,
    threadTs,
  });
  const run = await createRun({
    workspaceId: workspace.id,
    threadId: thread.id,
    trigger: "proactive",
    requestedBy: msg.userId,
    prompt: msg.text,
  });
  await runTurn({
    run,
    workspace,
    channelId: msg.channelId,
    threadTs,
    messageTs: msg.ts,
    userId: msg.userId,
    text: msg.text,
    trigger: "proactive",
    extraSections: [
      {
        title: "Why you are here",
        body: `Nobody asked you directly. You are watching this channel and chose to step in because: ${triage.reason}. Be brief and useful. If you are offering to automate something, describe the offer in two sentences and wait for a yes before setting anything up.`,
      },
    ],
  });
}
