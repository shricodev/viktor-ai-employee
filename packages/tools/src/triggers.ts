import { tool } from "@anthropic-ai/claude-agent-sdk";
import { createTrigger, deleteTrigger, listTriggerTypes } from "@viktor/composio";
import {
  createTriggerSubscription,
  deleteTriggerSubscription,
  listTriggerSubscriptions,
} from "@viktor/db";
import { z } from "zod";
import { error, json, type ToolContext, text } from "./context.ts";

export function triggerTools(ctx: ToolContext) {
  return [
    tool(
      "trigger_types",
      "List the events you can subscribe to for an app (for example gmail, github, linear, hubspot), including the config each one needs.",
      { toolkit: z.string() },
      async ({ toolkit }) => {
        const types = await listTriggerTypes(toolkit);
        return types.length ? json(types) : text(`No triggers available for ${toolkit}.`);
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "trigger_subscribe",
      "Start reacting to an event in another app. Each time it fires you get `instruction` plus the event data, and post the outcome in the channel. The app must already be connected.",
      {
        trigger_slug: z.string().describe("From trigger_types, e.g. GITHUB_ISSUE_ADDED_EVENT"),
        config: z.record(z.string(), z.unknown()).default({}),
        instruction: z.string().min(10).max(4000),
        channel_id: z.string().optional().describe("Defaults to the current channel"),
      },
      async ({ trigger_slug, config, instruction, channel_id }) => {
        let triggerId: string;
        try {
          triggerId = await createTrigger(ctx.workspaceId, trigger_slug, config);
        } catch (err) {
          return error(
            `Could not create the trigger: ${err instanceof Error ? err.message : String(err)}. Check the config and that the app is connected.`,
          );
        }
        const sub = await createTriggerSubscription({
          workspaceId: ctx.workspaceId,
          composioTriggerId: triggerId,
          triggerSlug: trigger_slug,
          triggerConfig: config,
          instruction,
          channelId: channel_id ?? ctx.channelId,
          createdBy: ctx.userId,
        });
        return json({ id: sub.id, trigger: trigger_slug, channel: `<#${sub.channelId}>` });
      },
    ),

    tool(
      "trigger_list",
      "List the app events you are subscribed to in this workspace.",
      {},
      async () => {
        const subs = await listTriggerSubscriptions(ctx.workspaceId);
        if (!subs.length) return text("No trigger subscriptions yet.");
        return json(
          subs.map((s) => ({
            id: s.id,
            trigger: s.triggerSlug,
            instruction: s.instruction,
            channel: `<#${s.channelId}>`,
            last_fired: s.lastFiredAt,
          })),
        );
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool("trigger_delete", "Stop reacting to an app event.", { id: z.uuid() }, async ({ id }) => {
      const sub = await deleteTriggerSubscription(ctx.workspaceId, id);
      if (!sub) return error("No trigger subscription with that id.");
      await deleteTrigger(sub.composioTriggerId).catch(() => undefined);
      return text(`Unsubscribed from ${sub.triggerSlug}.`);
    }),
  ];
}
