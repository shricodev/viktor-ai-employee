import { env } from "@viktor/config";
import { eq } from "drizzle-orm";
import { getDb } from "../client.ts";
import { decrypt, encrypt } from "../crypto.ts";
import { type WorkspaceSettings, workspaces } from "../schema.ts";

export type Workspace = typeof workspaces.$inferSelect;

export type WorkspaceUpsert = {
  id: string;
  enterpriseId?: string | null;
  name: string;
  botUserId: string;
  botId?: string | null;
  installerUserId: string;
  installation: unknown;
};

export async function upsertWorkspace(input: WorkspaceUpsert): Promise<void> {
  const installation = encrypt(JSON.stringify(input.installation), env().ENCRYPTION_KEY);
  const values = { ...input, installation, uninstalledAt: null };
  await getDb()
    .insert(workspaces)
    .values(values)
    .onConflictDoUpdate({ target: workspaces.id, set: values });
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  const [row] = await getDb().select().from(workspaces).where(eq(workspaces.id, id));
  return row;
}

export async function getInstallation<T>(id: string): Promise<T | undefined> {
  const ws = await getWorkspace(id);
  if (!ws || ws.uninstalledAt) return undefined;
  return JSON.parse(decrypt(ws.installation, env().ENCRYPTION_KEY)) as T;
}

export async function getBotToken(id: string): Promise<string> {
  const install = await getInstallation<{ bot?: { token?: string } }>(id);
  const token = install?.bot?.token;
  if (!token) throw new Error(`no bot token for workspace ${id}`);
  return token;
}

export async function markUninstalled(id: string): Promise<void> {
  await getDb().update(workspaces).set({ uninstalledAt: new Date() }).where(eq(workspaces.id, id));
}

export async function updateSettings(
  id: string,
  patch: Partial<WorkspaceSettings>,
): Promise<WorkspaceSettings> {
  const ws = await getWorkspace(id);
  if (!ws) throw new Error(`unknown workspace ${id}`);
  const settings = { ...ws.settings, ...patch };
  await getDb().update(workspaces).set({ settings }).where(eq(workspaces.id, id));
  return settings;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, "timezone" | "monthlyBudgetUsd" | "name">>,
): Promise<void> {
  await getDb().update(workspaces).set(patch).where(eq(workspaces.id, id));
}
