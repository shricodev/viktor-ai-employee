import { registerWebhook } from "@viktor/composio";
import { env } from "@viktor/config";

const url = `${env().PUBLIC_URL}/webhooks/composio`;
const sub = await registerWebhook(url);
console.log(`Composio will deliver trigger events to ${sub.webhookUrl}`);
if (sub.secret) {
  console.log(
    `\nSet this in your .env to verify signatures:\nCOMPOSIO_WEBHOOK_SECRET=${sub.secret}`,
  );
}
