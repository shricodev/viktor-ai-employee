import { useSession } from "./session.ts";

export type Connection = {
  slug: string;
  name: string;
  logo?: string;
  active: boolean;
};

export async function listConnections(workspaceId: string): Promise<Connection[]> {
  const session = await useSession(workspaceId);
  const connections: Connection[] = [];
  let cursor: string | undefined;
  do {
    const page = await session.toolkits({ isConnected: true, cursor, limit: 50 });
    for (const t of page.items) {
      connections.push({
        slug: t.slug,
        name: t.name,
        logo: t.logo,
        active: !!t.connection?.isActive,
      });
    }
    cursor = page.cursor;
  } while (cursor);
  return connections;
}

export async function connectLink(workspaceId: string, toolkit: string): Promise<string> {
  const session = await useSession(workspaceId);
  const request = await session.authorize(toolkit);
  if (!request.redirectUrl) throw new Error(`${toolkit} does not need an OAuth link`);
  return request.redirectUrl;
}

export type ConnectLink = { toolkit: string; url: string };

/**
 * Pulls connect links out of a COMPOSIO_MANAGE_CONNECTIONS result. The payload shape
 * varies by version, so this walks the JSON looking for toolkit + redirect URL pairs.
 */
export function extractConnectLinks(payload: unknown): ConnectLink[] {
  const found = new Map<string, ConnectLink>();

  const visit = (value: unknown, toolkitHint?: string) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          visit(JSON.parse(trimmed), toolkitHint);
        } catch {}
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) visit(v, toolkitHint);
      return;
    }
    if (!value || typeof value !== "object") return;

    const obj = value as Record<string, unknown>;
    const explicit =
      (typeof obj.toolkit === "string" && obj.toolkit) ||
      (typeof obj.toolkit_slug === "string" && obj.toolkit_slug) ||
      (typeof obj.app === "string" && obj.app) ||
      undefined;
    const toolkit = explicit ?? toolkitHint;
    const url = obj.redirect_url ?? obj.redirectUrl ?? obj.connect_url;
    if (typeof url === "string" && /^https:\/\//.test(url) && toolkit) {
      found.set(url, { toolkit: toolkit.toLowerCase(), url });
    }
    for (const [key, v] of Object.entries(obj)) {
      const childHint = !Array.isArray(v) && typeof v === "object" && v !== null ? key : toolkit;
      visit(v, explicit ?? childHint);
    }
  };

  visit(payload);
  return [...found.values()];
}
