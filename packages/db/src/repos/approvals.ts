import { and, eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { approvals } from "../schema.ts";

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type ApprovalDecision = "approved" | "denied" | "expired";

export async function createApproval(input: NewApproval): Promise<Approval> {
  const [row] = await getDb().insert(approvals).values(input).returning();
  return row!;
}

export async function getApproval(id: string): Promise<Approval | undefined> {
  const [row] = await getDb().select().from(approvals).where(eq(approvals.id, id));
  return row;
}

export async function setApprovalMessage(id: string, messageTs: string): Promise<void> {
  await getDb().update(approvals).set({ messageTs }).where(eq(approvals.id, id));
}

/** Records a decision only if the approval is still pending; returns null when it was already decided. */
export async function decideApproval(
  id: string,
  status: ApprovalDecision,
  decidedBy: string | null,
): Promise<Approval | null> {
  const [row] = await getDb()
    .update(approvals)
    .set({ status, decidedBy, decidedAt: new Date() })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .returning();
  return row ?? null;
}

export async function pendingApprovals(workspaceId: string): Promise<Approval[]> {
  return getDb()
    .select()
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending")));
}
