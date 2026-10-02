import type { WebClient } from "@slack/web-api";
import type { Workspace } from "@viktor/db";

export async function isWorkspaceAdmin(
  client: WebClient,
  workspace: Workspace,
  userId: string,
): Promise<boolean> {
  if (userId === workspace.installerUserId) return true;
  const res = await client.users.info({ user: userId }).catch(() => null);
  return !!(res?.user?.is_admin || res?.user?.is_owner);
}
