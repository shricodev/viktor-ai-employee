import type { AllMiddlewareArgs, App, BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { connectLink, deleteTrigger } from "@viktor/composio";
import { env, logger } from "@viktor/config";
import {
  deleteMemory,
  deleteSchedule,
  deleteTriggerSubscription,
  getWorkspace,
  setScheduleEnabled,
  updateSettings,
  updateWorkspace,
  type Workspace,
} from "@viktor/db";
import {
  enqueue,
  removeDailyCheckin,
  removeSchedule,
  upsertDailyCheckin,
  upsertSchedule,
} from "@viktor/queue";
import { isValidTimezone } from "@viktor/tools";
import { loadHomeData } from "../home/data.ts";
import { connectLinkModal, connectModal, settingsModal } from "../home/modals.ts";
import { buildHomeView } from "../home/view.ts";
import { isWorkspaceAdmin } from "../permissions.ts";
import { invalidateSettings } from "../settings-cache.ts";

export async function publishHome(client: WebClient, workspace: Workspace, userId: string) {
  const data = await loadHomeData(client, workspace, userId);
  await client.views.publish({ user_id: userId, view: buildHomeView(data) });
}

type ActionArgs = { body: BlockAction; client: WebClient; context: AllMiddlewareArgs["context"] };

/** Runs an admin-only App Home action, then re-renders the tab for the user who clicked. */
async function adminAction(
  { body, client, context }: ActionArgs,
  fn: (workspace: Workspace) => Promise<void>,
): Promise<void> {
  const workspace = context.teamId ? await getWorkspace(context.teamId) : undefined;
  if (!workspace) return;
  if (!(await isWorkspaceAdmin(client, workspace, body.user.id))) {
    logger.warn({ userId: body.user.id }, "non-admin attempted an admin home action");
    return;
  }
  await fn(workspace);
  invalidateSettings(workspace.id);
  const fresh = await getWorkspace(workspace.id);
  if (fresh) await publishHome(client, fresh, body.user.id);
}

async function joinChannels(client: WebClient, channels: string[]) {
  await Promise.allSettled(channels.map((channel) => client.conversations.join({ channel })));
}

function actionValue(body: BlockAction): string {
  const action = body.actions[0];
  if (!action) return "";
  if (action.type === "button") return action.value ?? "";
  if (action.type === "overflow") return action.selected_option.value;
  return "";
}

export function registerHomeHandlers(app: App): void {
  app.event("app_home_opened", async ({ event, client, context }) => {
    if (event.tab !== "home" || !context.teamId) return;
    const workspace = await getWorkspace(context.teamId);
    if (workspace) await publishHome(client, workspace, event.user);
  });

  app.action("home_connect", async ({ ack, body, client }) => {
    await ack();
    if ("trigger_id" in body)
      await client.views.open({ trigger_id: body.trigger_id, view: connectModal() });
  });

  app.action("connect_open", async ({ ack }) => {
    await ack();
  });

  app.view("connect_app", async ({ ack, view, context }) => {
    const raw = view.state.values.app?.value?.value ?? "";
    const toolkit = raw
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "");
    if (!toolkit || !context.teamId) {
      await ack({ response_action: "errors", errors: { app: "Enter an app name" } });
      return;
    }
    try {
      const url = await connectLink(context.teamId, toolkit);
      await ack({ response_action: "update", view: connectLinkModal(raw.trim(), url) });
    } catch (err) {
      logger.warn({ err, toolkit }, "connect link failed");
      await ack({
        response_action: "errors",
        errors: { app: `Couldn't find "${raw.trim()}". Try its plain name, like googlesheets.` },
      });
    }
  });

  app.action("home_settings", async ({ ack, body, client, context }) => {
    await ack();
    const workspace = context.teamId ? await getWorkspace(context.teamId) : undefined;
    if (!workspace || !("trigger_id" in body)) return;
    if (!(await isWorkspaceAdmin(client, workspace, body.user.id))) return;
    await client.views.open({
      trigger_id: body.trigger_id,
      view: settingsModal({
        budgetUsd: workspace.monthlyBudgetUsd ?? env().DEFAULT_MONTHLY_BUDGET_USD,
        timezone: workspace.timezone,
        persona: workspace.settings.persona,
      }),
    });
  });

  app.view("settings", async ({ ack, view, body, client, context }) => {
    const values = view.state.values;
    const budget = Number(values.budget?.value?.value ?? "0");
    const timezone = (values.timezone?.value?.value ?? "").trim();
    const persona = (values.persona?.value?.value ?? "").trim();
    if (!isValidTimezone(timezone)) {
      await ack({ response_action: "errors", errors: { timezone: "Unknown timezone" } });
      return;
    }
    await ack();
    const workspace = context.teamId ? await getWorkspace(context.teamId) : undefined;
    if (!workspace || !(await isWorkspaceAdmin(client, workspace, body.user.id))) return;

    await updateWorkspace(workspace.id, { monthlyBudgetUsd: budget, timezone });
    await updateSettings(workspace.id, { persona: persona || undefined });
    if (workspace.settings.checkinChannelId && timezone !== workspace.timezone) {
      await upsertDailyCheckin(workspace.id, timezone);
    }
    invalidateSettings(workspace.id);
    const fresh = await getWorkspace(workspace.id);
    if (fresh) await publishHome(client, fresh, body.user.id);
  });

  app.action<BlockAction>("home_watch_channels", async (args) => {
    await args.ack();
    const action = args.body.actions[0];
    const channels =
      action?.type === "multi_conversations_select" ? action.selected_conversations : [];
    await adminAction(args, async (ws) => {
      await updateSettings(ws.id, { proactiveChannels: channels });
      await joinChannels(args.client, channels);
    });
  });

  app.action<BlockAction>("home_checkin_channel", async (args) => {
    await args.ack();
    const action = args.body.actions[0];
    const channel = action?.type === "conversations_select" ? action.selected_conversation : null;
    if (!channel) return;
    await adminAction(args, async (ws) => {
      await updateSettings(ws.id, { checkinChannelId: channel });
      await joinChannels(args.client, [channel]);
      await upsertDailyCheckin(ws.id, ws.timezone);
    });
  });

  app.action<BlockAction>("home_checkin_disable", async (args) => {
    await args.ack();
    await adminAction(args, async (ws) => {
      await updateSettings(ws.id, { checkinChannelId: undefined });
      await removeDailyCheckin(ws.id);
    });
  });

  app.action<BlockAction>("home_schedule_menu", async (args) => {
    await args.ack();
    const [op, id] = actionValue(args.body).split(":");
    if (!id) return;
    await adminAction(args, async (ws) => {
      if (op === "delete") {
        await deleteSchedule(ws.id, id);
        await removeSchedule(id);
        return;
      }
      const s = await setScheduleEnabled(ws.id, id, op === "resume");
      if (!s) return;
      if (s.enabled) await upsertSchedule({ id, cron: s.cron, timezone: s.timezone });
      else await removeSchedule(id);
    });
  });

  app.action<BlockAction>("home_trigger_delete", async (args) => {
    await args.ack();
    await adminAction(args, async (ws) => {
      const sub = await deleteTriggerSubscription(ws.id, actionValue(args.body));
      if (sub) await deleteTrigger(sub.composioTriggerId).catch(() => undefined);
    });
  });

  app.action<BlockAction>("home_memory_forget", async (args) => {
    await args.ack();
    await adminAction(args, async (ws) => {
      await deleteMemory(ws.id, actionValue(args.body));
    });
  });

  app.action<BlockAction>("home_auto_revoke", async (args) => {
    await args.ack();
    const slug = actionValue(args.body);
    await adminAction(args, async (ws) => {
      await updateSettings(ws.id, (current) => ({
        autoApprovedTools: (current.autoApprovedTools ?? []).filter((s) => s !== slug),
      }));
    });
  });

  app.action<BlockAction>("home_wipe", async (args) => {
    await args.ack();
    await adminAction(args, async (ws) => {
      await enqueue("wipe-workspace", { workspaceId: ws.id, requestedBy: args.body.user.id });
      logger.info({ workspaceId: ws.id, userId: args.body.user.id }, "workspace wipe requested");
    });
  });
}
