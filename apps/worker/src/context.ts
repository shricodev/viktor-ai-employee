import { listConnections } from "@viktor/composio";
import { logger } from "@viktor/config";
import { listSkills, searchMemories } from "@viktor/db";
import { embed } from "@viktor/tools";

export type Section = { title: string; body: string };

async function knowledgeSections(workspaceId: string, query: string): Promise<Section[]> {
  const [memories, skills] = await Promise.all([
    query.trim()
      ? searchMemories({ workspaceId, query, embedding: await embed(query, "query"), limit: 8 })
      : Promise.resolve([]),
    listSkills(workspaceId),
  ]);
  return [
    {
      title: "Relevant memories",
      body: memories.map((m) => `- ${m.content} (id ${m.id})`).join("\n"),
    },
    {
      title: "Your skills",
      body: skills.map((s) => `- ${s.name}: ${s.description}`).join("\n"),
    },
  ];
}

async function connectedAppsSection(workspaceId: string): Promise<Section> {
  const apps = await listConnections(workspaceId).catch((err) => {
    logger.warn({ err, workspaceId }, "could not list composio connections");
    return null;
  });
  if (!apps) return { title: "Connected apps", body: "Unknown (lookup failed)." };
  const active = apps.filter((a) => a.active).map((a) => a.slug);
  return { title: "Connected apps", body: active.length ? active.join(", ") : "None yet." };
}

/** Memories relevant to the message, the skill index and connected apps. */
export async function workspaceContext(workspaceId: string, query: string): Promise<Section[]> {
  const [knowledge, apps] = await Promise.all([
    knowledgeSections(workspaceId, query).catch((err) => {
      logger.warn({ err, workspaceId }, "failed to load memories and skills");
      return [];
    }),
    connectedAppsSection(workspaceId),
  ]);
  return [...knowledge, apps];
}
