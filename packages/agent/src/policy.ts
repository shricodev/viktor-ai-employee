export type Decision = { action: "allow" } | { action: "approve"; actions: string[] };

const wordSet = (list: string) => new Set(list.trim().split(/\s+/));

const SAFE_BUILTINS = new Set(["WebSearch", "WebFetch", "TodoWrite"]);

const SAFE_COMPOSIO_META = new Set([
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MANAGE_CONNECTIONS",
]);

const WRITE_VERBS = wordSet(`
  ADD APPROVE ARCHIVE ASSIGN BAN CANCEL CHARGE CLOSE COMMENT COPY CREATE DECLINE DELETE
  DEPLOY DISABLE DISMISS DUPLICATE EDIT ENABLE EXECUTE FORWARD IMPORT INSERT INVITE KICK
  LOCK MARK MERGE MODIFY MOVE PATCH PAUSE PAY POST PUBLISH PUT REFUND REMOVE RENAME
  REOPEN REPLACE REPLY REQUEST RESET RESTORE REVOKE RUN SCHEDULE SEND SET SHARE START
  STAR STOP SUBMIT SUBSCRIBE TRANSFER TRASH TRIGGER UNARCHIVE UNLOCK UNSUBSCRIBE UPDATE
  UPLOAD UPSERT WRITE
`);

const READ_VERBS = wordSet(`
  CHECK COUNT DESCRIBE DOWNLOAD EXPORT FETCH FIND GET LIST LOOKUP PREVIEW QUERY READ
  RETRIEVE SEARCH VIEW
`);

export function isReadOnlySlug(slug: string): boolean {
  const words = slug.toUpperCase().split("_");
  // Drafts are reviewable by a human before they go anywhere.
  if (words.includes("DRAFT") && !words.includes("SEND") && !words.includes("DELETE")) return true;
  if (words.some((w) => WRITE_VERBS.has(w))) return false;
  return words.some((w) => READ_VERBS.has(w));
}

function nestedSlugs(input: Record<string, unknown>): string[] {
  if (!Array.isArray(input.tools)) return [];
  return input.tools
    .map((t) => (t && typeof t === "object" && "tool_slug" in t ? String(t.tool_slug) : ""))
    .filter(Boolean);
}

export type PolicyOptions = { autoApproved?: string[] };

export function decide(
  toolName: string,
  input: Record<string, unknown>,
  opts: PolicyOptions = {},
): Decision {
  const auto = new Set((opts.autoApproved ?? []).map((s) => s.toUpperCase()));
  const needs = (slugs: string[]): Decision => {
    const risky = slugs.filter((s) => !isReadOnlySlug(s) && !auto.has(s.toUpperCase()));
    return risky.length ? { action: "approve", actions: risky } : { action: "allow" };
  };

  if (SAFE_BUILTINS.has(toolName)) return { action: "allow" };

  const mcp = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (!mcp) return needs([toolName]);
  const server = mcp[1]!;
  const tool = mcp[2]!;

  if (server === "viktor") return { action: "allow" };
  if (server !== "composio") return needs([tool]);

  if (SAFE_COMPOSIO_META.has(tool)) return { action: "allow" };
  if (tool === "COMPOSIO_MULTI_EXECUTE_TOOL") {
    const slugs = nestedSlugs(input);
    return slugs.length ? needs(slugs) : { action: "approve", actions: [tool] };
  }
  if (tool === "COMPOSIO_PROXY_EXECUTE") {
    const method = String(input.method ?? "GET").toUpperCase();
    return method === "GET" ? { action: "allow" } : needs([`PROXY_${method}`]);
  }
  return needs([tool]);
}
