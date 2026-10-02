import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { skills } from "../schema.ts";

export type Skill = typeof skills.$inferSelect;

export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function saveSkill(input: {
  workspaceId: string;
  name: string;
  description: string;
  body: string;
  createdBy?: string;
}): Promise<Skill> {
  const values = { ...input, name: normalizeSkillName(input.name) };
  const [row] = await getDb()
    .insert(skills)
    .values(values)
    .onConflictDoUpdate({
      target: [skills.workspaceId, skills.name],
      set: { description: values.description, body: values.body, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function getSkill(workspaceId: string, name: string): Promise<Skill | undefined> {
  const [row] = await getDb()
    .select()
    .from(skills)
    .where(and(eq(skills.workspaceId, workspaceId), eq(skills.name, normalizeSkillName(name))));
  return row;
}

export async function listSkills(
  workspaceId: string,
): Promise<Pick<Skill, "name" | "description" | "updatedAt">[]> {
  return getDb()
    .select({ name: skills.name, description: skills.description, updatedAt: skills.updatedAt })
    .from(skills)
    .where(eq(skills.workspaceId, workspaceId))
    .orderBy(asc(skills.name));
}

export async function deleteSkill(workspaceId: string, name: string): Promise<boolean> {
  const rows = await getDb()
    .delete(skills)
    .where(and(eq(skills.workspaceId, workspaceId), eq(skills.name, normalizeSkillName(name))))
    .returning({ id: skills.id });
  return rows.length > 0;
}
