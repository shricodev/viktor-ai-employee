import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../client.ts";
import {
  agentSessionEntries,
  approvals,
  memories,
  runs,
  schedules,
  skills,
  threads,
  triggerSubscriptions,
} from "../schema.ts";

export type WipeResult = {
  scheduleIds: string[];
  composioTriggerIds: string[];
  memories: number;
  skills: number;
  threads: number;
};

/**
 * Deletes everything Viktor learned or stored for a workspace while keeping the
 * installation and usage totals (run prompts and results are scrubbed, costs kept).
 */
export async function wipeWorkspaceData(workspaceId: string): Promise<WipeResult> {
  return getDb().transaction(async (tx) => {
    const sessions = await tx
      .select({ id: threads.sessionId })
      .from(threads)
      .where(and(eq(threads.workspaceId, workspaceId), isNotNull(threads.sessionId)));
    const sessionIds = sessions.map((s) => s.id!).filter(Boolean);
    if (sessionIds.length) {
      await tx
        .delete(agentSessionEntries)
        .where(inArray(agentSessionEntries.sessionId, sessionIds));
    }

    const deletedThreads = await tx
      .delete(threads)
      .where(eq(threads.workspaceId, workspaceId))
      .returning({ id: threads.id });
    await tx
      .update(runs)
      .set({ prompt: "[wiped]", result: null, error: null })
      .where(eq(runs.workspaceId, workspaceId));
    await tx.delete(approvals).where(eq(approvals.workspaceId, workspaceId));

    const deletedMemories = await tx
      .delete(memories)
      .where(eq(memories.workspaceId, workspaceId))
      .returning({ id: memories.id });
    const deletedSkills = await tx
      .delete(skills)
      .where(eq(skills.workspaceId, workspaceId))
      .returning({ id: skills.id });
    const deletedSchedules = await tx
      .delete(schedules)
      .where(eq(schedules.workspaceId, workspaceId))
      .returning({ id: schedules.id });
    const deletedTriggers = await tx
      .delete(triggerSubscriptions)
      .where(eq(triggerSubscriptions.workspaceId, workspaceId))
      .returning({ id: triggerSubscriptions.composioTriggerId });

    return {
      scheduleIds: deletedSchedules.map((s) => s.id),
      composioTriggerIds: deletedTriggers.map((t) => t.id),
      memories: deletedMemories.length,
      skills: deletedSkills.length,
      threads: deletedThreads.length,
    };
  });
}
