import { parseTriggerWebhook } from "@viktor/composio";
import { env, logger } from "@viktor/config";
import { findTriggerByComposioId } from "@viktor/db";
import { enqueue } from "@viktor/queue";
import express, { type Router } from "express";

export function mountComposioWebhook(router: Router): void {
  router.post(
    "/webhooks/composio",
    express.raw({ type: "application/json", limit: "2mb" }),
    async (req, res) => {
      let event: Awaited<ReturnType<typeof parseTriggerWebhook>>;
      try {
        event = await parseTriggerWebhook(
          { body: req.body as Buffer, headers: req.headers },
          env().COMPOSIO_WEBHOOK_SECRET,
        );
      } catch (err) {
        logger.warn({ err }, "rejected composio webhook");
        res.sendStatus(401);
        return;
      }

      const sub = await findTriggerByComposioId(event.triggerId);
      if (!sub?.enabled) {
        logger.info({ triggerId: event.triggerId }, "webhook for unknown or disabled trigger");
        res.sendStatus(202);
        return;
      }

      await enqueue(
        "trigger-event",
        { subscriptionId: sub.id, triggerSlug: event.triggerSlug, payload: event.payload },
        { jobId: `trigger-${event.eventId}`, attempts: 1 },
      );
      res.sendStatus(202);
    },
  );
}
