import { getWorkspace, type WorkspaceSettings } from "@viktor/db";

const TTL_MS = 60_000;
const cache = new Map<string, { settings: WorkspaceSettings; expires: number }>();

export async function workspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const hit = cache.get(workspaceId);
  if (hit && hit.expires > Date.now()) return hit.settings;
  const settings = (await getWorkspace(workspaceId))?.settings ?? {};
  cache.set(workspaceId, { settings, expires: Date.now() + TTL_MS });
  return settings;
}

export function invalidateSettings(workspaceId: string): void {
  cache.delete(workspaceId);
}
