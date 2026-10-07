import type { WebClient } from "@slack/web-api";
import { listConnections } from "@viktor/composio";
import { env, logger } from "@viktor/config";
import {
  countMemories,
  countRunsSince,
  listSchedules,
  listSkills,
  listTriggerSubscriptions,
  recentMemories,
  spendSince,
  type Workspace,
} from "@viktor/db";
import { formatRun, nextRuns } from "@viktor/tools";
import { isWorkspaceAdmin } from "../permissions.ts";
import type { HomeData } from "./view.ts";

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function loadHomeData(
  client: WebClient,
  workspace: Workspace,
  userId: string,
): Promise<HomeData> {
  const since = monthStart();
  const [isAdmin, spend, runs, connections, schedules, triggers, memoryCount, memories, skills] =
    await Promise.all([
      isWorkspaceAdmin(client, workspace, userId),
      spendSince(workspace.id, since),
      countRunsSince(workspace.id, since),
      listConnections(workspace.id).catch((err) => {
        logger.warn({ err, workspaceId: workspace.id }, "home: failed to list connections");
        return null;
      }),
      listSchedules(workspace.id),
      listTriggerSubscriptions(workspace.id),
      countMemories(workspace.id),
      recentMemories(workspace.id, 5),
      listSkills(workspace.id),
    ]);

  return {
    isAdmin,
    name: workspace.name,
    timezone: workspace.timezone,
    budgetUsd: workspace.monthlyBudgetUsd ?? env().DEFAULT_MONTHLY_BUDGET_USD,
    spendUsd: spend,
    runsThisMonth: runs,
    connections:
      connections?.filter((c) => c.active).map((c) => ({ slug: c.slug, name: c.name })) ?? null,
    proactiveChannels: workspace.settings.proactiveChannels ?? [],
    checkinChannelId: workspace.settings.checkinChannelId,
    schedules: schedules.map((s) => {
      let nextRun: string | undefined;
      try {
        nextRun = s.enabled
          ? formatRun(nextRuns(s.cron, s.timezone, 1)[0]!, s.timezone)
          : undefined;
      } catch {}
      return {
        id: s.id,
        name: s.name,
        cron: s.cron,
        channelId: s.channelId,
        enabled: s.enabled,
        nextRun,
      };
    }),
    triggers: triggers.map((t) => ({
      id: t.id,
      triggerSlug: t.triggerSlug,
      channelId: t.channelId,
    })),
    memoryCount,
    recentMemories: memories.map((m) => ({ id: m.id, content: m.content })),
    skills: skills.map((s) => ({ name: s.name, description: s.description })),
    autoApproved: workspace.settings.autoApprovedTools ?? [],
  };
}
