import { posix } from "node:path";

export const WORKSPACE_ROOT = "/workspace";

/** Resolves a user-supplied path inside /workspace, rejecting anything that escapes it. */
export function resolveWorkspacePath(input: string): string {
  const resolved = posix.resolve(WORKSPACE_ROOT, input.trim() || ".");
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}/`)) {
    throw new Error(`path must be inside ${WORKSPACE_ROOT}: ${input}`);
  }
  return resolved;
}

export function containerName(workspaceId: string): string {
  return `viktor-sbx-${workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export function volumeName(workspaceId: string): string {
  return `viktor-ws-${workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n…[${text.length - max} characters truncated]…\n${text.slice(-tail)}`;
}
