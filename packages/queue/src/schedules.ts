import { queue } from "./queues.ts";

export type ScheduleSpec = { id: string; cron: string; timezone: string };

export async function upsertSchedule(spec: ScheduleSpec): Promise<void> {
  await queue("scheduled-run").upsertJobScheduler(
    `schedule-${spec.id}`,
    { pattern: spec.cron, tz: spec.timezone },
    { name: "scheduled-run", data: { scheduleId: spec.id }, opts: { attempts: 1 } },
  );
}

export async function removeSchedule(id: string): Promise<void> {
  await queue("scheduled-run").removeJobScheduler(`schedule-${id}`);
}

export async function upsertDailyCheckin(workspaceId: string, timezone: string): Promise<void> {
  await queue("daily-checkin").upsertJobScheduler(
    `checkin-${workspaceId}`,
    { pattern: "0 9 * * 1-5", tz: timezone },
    { name: "daily-checkin", data: { workspaceId }, opts: { attempts: 1 } },
  );
}

export async function removeDailyCheckin(workspaceId: string): Promise<void> {
  await queue("daily-checkin").removeJobScheduler(`checkin-${workspaceId}`);
}
