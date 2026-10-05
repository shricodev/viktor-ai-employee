import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { env, logger } from "@viktor/config";
import { registerApprovalHandlers } from "./handlers/approvals.ts";
import { registerLifecycleHandlers } from "./handlers/lifecycle.ts";
import { registerMessageHandlers } from "./handlers/messages.ts";
import { installationStore } from "./installation-store.ts";
import { connectedPage, connectFailedPage } from "./pages.ts";
import { mountComposioWebhook } from "./routes/composio-webhook.ts";

export const BOT_SCOPES = [
  "app_mentions:read",
  "assistant:write",
  "channels:history",
  "channels:join",
  "channels:read",
  "chat:write",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "reactions:read",
  "reactions:write",
  "team:read",
  "users:read",
  "users:read.email",
];

const boltLogger = {
  debug: (...msg: unknown[]) => logger.debug({ msg }, "bolt"),
  info: (...msg: unknown[]) => logger.info({ msg }, "bolt"),
  warn: (...msg: unknown[]) => logger.warn({ msg }, "bolt"),
  error: (...msg: unknown[]) => logger.error({ msg }, "bolt"),
  setLevel: () => {},
  getLevel: () => LogLevel.INFO,
  setName: () => {},
};

export function createSlackApp() {
  const config = env();
  const receiver = new ExpressReceiver({
    signingSecret: config.SLACK_SIGNING_SECRET,
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_CLIENT_SECRET,
    stateSecret: config.SLACK_STATE_SECRET,
    scopes: BOT_SCOPES,
    installationStore,
    redirectUri: `${config.PUBLIC_URL}/slack/oauth_redirect`,
    installerOptions: {
      directInstall: true,
      redirectUriPath: "/slack/oauth_redirect",
    },
    logger: boltLogger,
  });

  const app = new App({ receiver, logger: boltLogger });

  app.error(async (error) => {
    logger.error({ err: error }, "unhandled slack error");
  });

  registerMessageHandlers(app);
  registerLifecycleHandlers(app);
  registerApprovalHandlers(app);

  receiver.router.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  mountComposioWebhook(receiver.router);

  receiver.router.get("/composio/callback", (req, res) => {
    const failed = req.query.status === "failed" || typeof req.query.error === "string";
    res.type("html").send(failed ? connectFailedPage : connectedPage);
  });

  return { app, receiver };
}
