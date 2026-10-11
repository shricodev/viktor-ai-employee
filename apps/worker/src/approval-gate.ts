import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { decide } from "@viktor/agent";
import { env, logger } from "@viktor/config";
import { createApproval, decideApproval, getApproval, setApprovalMessage } from "@viktor/db";
import { waitForApproval } from "@viktor/queue";
import { approvalCard, resolvedApprovalCard, slackFor, titleCase } from "@viktor/slack";

export type GateContext = {
  workspaceId: string;
  runId: string;
  channelId: string;
  threadTs: string;
  requestedBy?: string;
  autoApproved: string[];
  onWaiting?: (label: string) => void;
};

function callsFor(input: Record<string, unknown>, actions: string[]) {
  if (Array.isArray(input.tools)) {
    return input.tools
      .filter((t): t is { tool_slug: string; arguments?: unknown } => !!t?.tool_slug)
      .filter((t) => actions.includes(t.tool_slug))
      .map((t) => ({ action: t.tool_slug, args: t.arguments ?? {} }));
  }
  return actions.map((action) => ({ action, args: input }));
}

/** Pauses risky tool calls until a human approves them in Slack. */
export function approvalGate(ctx: GateContext): CanUseTool {
  return async (toolName, input, { signal }) => {
    const decision = decide(toolName, input, { autoApproved: ctx.autoApproved });
    if (decision.action === "allow") return { behavior: "allow", updatedInput: input };

    const slack = await slackFor(ctx.workspaceId);
    const approval = await createApproval({
      workspaceId: ctx.workspaceId,
      runId: ctx.runId,
      toolName,
      toolInput: input,
      actions: decision.actions,
      requestedBy: ctx.requestedBy,
      channelId: ctx.channelId,
      threadTs: ctx.threadTs,
    });
    const posted = await slack.chat.postMessage({
      channel: ctx.channelId,
      thread_ts: ctx.threadTs,
      text: `Approval needed: ${decision.actions.map(titleCase).join(", ")}`,
      blocks: approvalCard({
        id: approval.id,
        requestedBy: ctx.requestedBy,
        calls: callsFor(input, decision.actions),
        canAlwaysAllow: true,
      }),
    });
    if (posted.ts) await setApprovalMessage(approval.id, posted.ts);
    ctx.onWaiting?.(`Waiting for approval: ${decision.actions.map(titleCase).join(", ")}`);

    let outcome = await waitForApproval(
      approval.id,
      env().APPROVAL_TIMEOUT_MS,
      signal,
      async () => {
        const row = await getApproval(approval.id);
        return row && row.status !== "pending" ? row.status : null;
      },
    );

    if (outcome === "expired") {
      const expired = await decideApproval(approval.id, "expired", null);
      if (!expired) {
        // A decision landed but its pub/sub message was missed; the database is the source of truth.
        const row = await getApproval(approval.id);
        if (row && row.status !== "pending") outcome = row.status;
      } else if (posted.ts) {
        await slack.chat
          .update({
            channel: ctx.channelId,
            ts: posted.ts,
            text: "Approval expired",
            blocks: resolvedApprovalCard(decision.actions, "expired"),
          })
          .catch((err) => logger.warn({ err }, "failed to mark approval expired"));
      }
    }

    logger.info(
      { approvalId: approval.id, actions: decision.actions, outcome },
      "approval resolved",
    );
    if (outcome === "approved") return { behavior: "allow", updatedInput: input };
    return {
      behavior: "deny",
      message:
        outcome === "denied"
          ? "A teammate denied this action. Do not retry it; explain what was not done and offer alternatives."
          : "Nobody approved this action in time. Do not retry it; tell the team it is waiting on approval and they can ask again.",
    };
  };
}
