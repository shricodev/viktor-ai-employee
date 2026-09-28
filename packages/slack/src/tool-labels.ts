const KNOWN: Record<string, string> = {
  WebSearch: "Searching the web",
  WebFetch: "Reading a web page",
  TodoWrite: "Planning",
};

function humanize(slug: string): string {
  const words = slug.toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (!words.length) return slug;
  const [first, ...rest] = words;
  return [first!.charAt(0).toUpperCase() + first!.slice(1), ...rest].join(" ");
}

export function describeTool(name: string, input: Record<string, unknown> = {}): string {
  if (KNOWN[name]) {
    const q = typeof input.query === "string" ? `: ${input.query}` : "";
    return `${KNOWN[name]}${name === "WebSearch" ? q : ""}`;
  }
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  if (!mcp) return humanize(name);
  const tool = mcp[2]!;
  const nested = Array.isArray(input.tools)
    ? input.tools
        .map((t) => (t && typeof t === "object" && "tool_slug" in t ? String(t.tool_slug) : null))
        .filter((s): s is string => !!s)
    : [];
  if (nested.length) return nested.map(humanize).join(", ");
  return humanize(tool);
}
