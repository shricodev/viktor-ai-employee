import type { App, BlockAction, ButtonAction } from "@slack/bolt";
import { logger } from "@viktor/config";
import { decideApproval, getApproval, getWorkspace, updateSettings } from "@viktor/db";
import { publishApproval } from "@viktor/queue";
import { resolvedApprovalCard } from "@viktor/slack";
import { isWorkspaceAdmin } from "../permissions.ts";

export function registerApprovalHandlers(app: App): void {
  app.action<BlockAction<ButtonAction>>(
    /^approval_(approve|deny|always)$/,
    async ({ ack, body, action, client, context, respond }) => {
      await ack();
      const userId = body.user.id;
      const kind = action.action_id.replace("approval_", "") as "approve" | "deny" | "always";
      const ephemeral = (text: string) =>
        respond({ response_type: "ephemeral", replace_original: false, text });

      const [approval, workspace] = await Promise.all([
        getApproval(action.value ?? ""),
        context.teamId ? getWorkspace(context.teamId) : undefined,
      ]);
      if (!approval || !workspace || approval.workspaceId !== workspace.id) return;
      if (approval.status !== "pending") {
        await ephemeral("That request was already decided.");
        return;
      }

      const admin = await isWorkspaceAdmin(client, workspace, userId);
      if (!admin && userId !== approval.requestedBy) {
        await ephemeral(
          `Only ${approval.requestedBy ? `<@${approval.requestedBy}>` : "the requester"} or a workspace admin can decide on this.`,
        );
        return;
      }
      if (kind === "always" && !admin) {
        await ephemeral("Only workspace admins can allow an action permanently.");
        return;
      }

      const outcome = kind === "deny" ? "denied" : "approved";
      const decided = await decideApproval(approval.id, outcome, userId);
      if (!decided) {
        await ephemeral("That request was already decided.");
        return;
      }

      if (kind === "always") {
        const current = new Set(workspace.settings.autoApprovedTools ?? []);
        for (const a of approval.actions) current.add(a);
        await updateSettings(workspace.id, { autoApprovedTools: [...current] });
      }

      await publishApproval(approval.id, outcome);
      logger.info({ approvalId: approval.id, outcome, userId }, "approval decided");

      if (approval.messageTs) {
        await client.chat.update({
          channel: approval.channelId,
          ts: approval.messageTs,
          text: `${outcome === "approved" ? "Approved" : "Denied"} by <@${userId}>`,
          blocks: resolvedApprovalCard(approval.actions, outcome, userId, kind === "always"),
        });
      }
    },
  );
}
