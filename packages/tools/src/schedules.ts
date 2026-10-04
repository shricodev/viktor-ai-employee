import { tool } from "@anthropic-ai/claude-agent-sdk";
import { createSchedule, deleteSchedule, listSchedules, setScheduleEnabled } from "@viktor/db";
import { removeSchedule, upsertSchedule } from "@viktor/queue";
import { z } from "zod";
import { error, json, type ToolContext, text } from "./context.ts";
import { formatRun, nextRuns, validateCron } from "./cron.ts";

export function scheduleTools(ctx: ToolContext) {
  return [
    tool(
      "schedule_create",
      "Create recurring work you will do on your own, such as a Monday metrics report or a daily inbox digest. At each run you receive `prompt` as your instructions and post the result in the channel. Write the prompt so it is self-contained.",
      {
        name: z.string().min(3).max(80),
        cron: z.string().describe("5-field cron, e.g. '0 9 * * 1' for Mondays at 9:00"),
        prompt: z.string().min(10).max(4000),
        timezone: z.string().optional().describe("IANA timezone; defaults to the workspace's"),
        channel_id: z.string().optional().describe("Defaults to the current channel"),
      },
      async ({ name, cron, prompt, timezone, channel_id }) => {
        const tz = timezone ?? ctx.timezone;
        const problem = validateCron(cron, tz);
        if (problem) return error(problem);
        const schedule = await createSchedule({
          workspaceId: ctx.workspaceId,
          name,
          cron,
          timezone: tz,
          prompt,
          channelId: channel_id ?? ctx.channelId,
          createdBy: ctx.userId,
        });
        await upsertSchedule({ id: schedule.id, cron, timezone: tz });
        return json({
          id: schedule.id,
          next_runs: nextRuns(cron, tz, 3).map((d) => formatRun(d, tz)),
        });
      },
    ),

    tool(
      "schedule_list",
      "List this workspace's recurring schedules.",
      {},
      async () => {
        const all = await listSchedules(ctx.workspaceId);
        if (!all.length) return text("No schedules yet.");
        return json(
          all.map((s) => ({
            id: s.id,
            name: s.name,
            cron: s.cron,
            timezone: s.timezone,
            channel: `<#${s.channelId}>`,
            enabled: s.enabled,
            next_run: s.enabled ? formatRun(nextRuns(s.cron, s.timezone, 1)[0]!, s.timezone) : null,
          })),
        );
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "schedule_pause",
      "Pause or resume a schedule without deleting it.",
      { id: z.uuid(), paused: z.boolean() },
      async ({ id, paused }) => {
        const s = await setScheduleEnabled(ctx.workspaceId, id, !paused);
        if (!s) return error("No schedule with that id.");
        if (paused) await removeSchedule(id);
        else await upsertSchedule({ id, cron: s.cron, timezone: s.timezone });
        return text(paused ? `Paused "${s.name}".` : `Resumed "${s.name}".`);
      },
    ),

    tool("schedule_delete", "Delete a schedule permanently.", { id: z.uuid() }, async ({ id }) => {
      if (!(await deleteSchedule(ctx.workspaceId, id))) return error("No schedule with that id.");
      await removeSchedule(id);
      return text("Deleted.");
    }),
  ];
}
