import { tool } from "@anthropic-ai/claude-agent-sdk";
import { addMemory, deleteMemory, searchMemories } from "@viktor/db";
import { z } from "zod";
import { error, json, type ToolContext, text } from "./context.ts";
import { embed } from "./embeddings.ts";

export function memoryTools(ctx: ToolContext) {
  return [
    tool(
      "remember",
      "Save a durable fact about this team to long-term memory: preferences, how they work, who owns what, key accounts, recurring processes, definitions. Write one self-contained sentence per memory. Never store secrets or one-off details.",
      {
        content: z.string().min(3).max(2000),
        tags: z.array(z.string()).max(8).optional(),
      },
      async ({ content, tags }) => {
        const memory = await addMemory({
          workspaceId: ctx.workspaceId,
          content,
          tags,
          createdBy: ctx.userId,
          sourceChannelId: ctx.channelId,
          embedding: await embed(content, "document"),
        });
        return text(`Remembered (id ${memory.id}).`);
      },
    ),

    tool(
      "recall",
      "Search long-term memory for facts about this team. Use it before asking teammates something you may already have been told.",
      {
        query: z.string().min(2),
        limit: z.number().int().min(1).max(20).optional(),
      },
      async ({ query, limit }) => {
        const hits = await searchMemories({
          workspaceId: ctx.workspaceId,
          query,
          embedding: await embed(query, "query"),
          limit,
        });
        if (!hits.length) return text("No matching memories.");
        return json(hits.map((h) => ({ id: h.id, content: h.content, tags: h.tags })));
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "forget",
      "Delete a memory that is wrong or outdated, by id. Save the corrected fact with remember.",
      { id: z.uuid() },
      async ({ id }) =>
        (await deleteMemory(ctx.workspaceId, id))
          ? text("Forgotten.")
          : error("No memory with that id."),
    ),
  ];
}
