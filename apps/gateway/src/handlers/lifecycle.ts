import type { App } from "@slack/bolt";
import { logger } from "@viktor/config";
import { markUninstalled } from "@viktor/db";

export function registerLifecycleHandlers(app: App): void {
  app.event("app_uninstalled", async ({ context }) => {
    if (!context.teamId) return;
    await markUninstalled(context.teamId);
    logger.info({ workspaceId: context.teamId }, "app uninstalled");
  });

  app.event("tokens_revoked", async ({ event, context }) => {
    if (!context.teamId || !event.tokens.bot?.length) return;
    await markUninstalled(context.teamId);
    logger.info({ workspaceId: context.teamId }, "bot token revoked");
  });
}
