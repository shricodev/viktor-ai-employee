import { env, logger } from "@viktor/config";
import { getWorkspace, updateWorkspace } from "@viktor/db";
import { composio, composioUserId } from "./client.ts";

export type ComposioMcp = { type: "http"; url: string; headers: Record<string, string> };

type CachedSession = { id: string; mcp: ComposioMcp; expires: number };

const cache = new Map<string, CachedSession>();
const TTL_MS = 10 * 60_000;

async function createSession(workspaceId: string) {
  return composio().sessions.create(composioUserId(workspaceId), {
    mcp: true,
    manageConnections: {
      enable: true,
      callbackUrl: `${env().PUBLIC_URL}/composio/callback?workspace=${workspaceId}`,
    },
    // Code runs in our own per-workspace Docker sandbox instead.
    sandbox: { enable: false },
  });
}

async function resolve(workspaceId: string): Promise<CachedSession> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new Error(`unknown workspace ${workspaceId}`);

  let session: Awaited<ReturnType<typeof createSession>> | undefined;
  if (ws.composioSessionId) {
    session = await composio()
      .sessions.use(ws.composioSessionId, { mcp: true })
      .catch((err) => {
        logger.warn({ err, workspaceId }, "stored composio session unusable, creating a new one");
        return undefined;
      });
  }
  if (!session) {
    session = await createSession(workspaceId);
    await updateWorkspace(workspaceId, { composioSessionId: session.sessionId });
  }

  return {
    id: session.sessionId,
    mcp: { type: "http", url: session.mcp.url, headers: session.mcp.headers ?? {} },
    expires: Date.now() + TTL_MS,
  };
}

export async function composioSession(workspaceId: string): Promise<CachedSession> {
  const hit = cache.get(workspaceId);
  if (hit && hit.expires > Date.now()) return hit;
  const fresh = await resolve(workspaceId);
  cache.set(workspaceId, fresh);
  return fresh;
}

export async function composioMcpServer(workspaceId: string): Promise<ComposioMcp> {
  return (await composioSession(workspaceId)).mcp;
}

export async function useSession(workspaceId: string) {
  const { id } = await composioSession(workspaceId);
  return composio().sessions.use(id);
}

export function forgetSession(workspaceId: string): void {
  cache.delete(workspaceId);
}
