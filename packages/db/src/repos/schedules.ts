import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { schedules } from "../schema.ts";

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

export async function createSchedule(input: NewSchedule): Promise<Schedule> {
  const [row] = await getDb().insert(schedules).values(input).returning();
  return row!;
}

export async function getSchedule(id: string): Promise<Schedule | undefined> {
  const [row] = await getDb().select().from(schedules).where(eq(schedules.id, id));
  return row;
}

export async function listSchedules(workspaceId: string): Promise<Schedule[]> {
  return getDb()
    .select()
    .from(schedules)
    .where(eq(schedules.workspaceId, workspaceId))
    .orderBy(asc(schedules.createdAt));
}

export async function listEnabledSchedules(): Promise<Schedule[]> {
  return getDb().select().from(schedules).where(eq(schedules.enabled, true));
}

export async function setScheduleEnabled(
  workspaceId: string,
  id: string,
  enabled: boolean,
): Promise<Schedule | undefined> {
  const [row] = await getDb()
    .update(schedules)
    .set({ enabled })
    .where(and(eq(schedules.workspaceId, workspaceId), eq(schedules.id, id)))
    .returning();
  return row;
}

export async function deleteSchedule(workspaceId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(schedules)
    .where(and(eq(schedules.workspaceId, workspaceId), eq(schedules.id, id)))
    .returning({ id: schedules.id });
  return rows.length > 0;
}

export async function markScheduleRan(id: string): Promise<void> {
  await getDb().update(schedules).set({ lastRunAt: new Date() }).where(eq(schedules.id, id));
}
