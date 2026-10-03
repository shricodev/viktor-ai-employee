import { tool } from "@anthropic-ai/claude-agent-sdk";
import { deleteSkill, getSkill, listSkills, saveSkill } from "@viktor/db";
import { z } from "zod";
import { error, json, type ToolContext, text } from "./context.ts";

export function skillTools(ctx: ToolContext) {
  return [
    tool(
      "skill_list",
      "List the skills (saved playbooks) you have written for this team.",
      {},
      async () => {
        const skills = await listSkills(ctx.workspaceId);
        return skills.length
          ? json(skills.map((s) => ({ name: s.name, description: s.description })))
          : text("No skills saved yet.");
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "skill_read",
      "Read a saved skill before doing a task it covers, then follow it.",
      { name: z.string() },
      async ({ name }) => {
        const skill = await getSkill(ctx.workspaceId, name);
        return skill
          ? text(`# ${skill.name}\n${skill.description}\n\n${skill.body}`)
          : error("No such skill.");
      },
      { annotations: { readOnlyHint: true } },
    ),

    tool(
      "skill_save",
      "Save or update a skill: a reusable playbook in Markdown for a task this team asks for repeatedly (for example their weekly metrics report). Include the data sources and exact tool slugs, steps, output format, where scripts live in /workspace, and gotchas you discovered. Update it whenever you learn a better way.",
      {
        name: z
          .string()
          .min(2)
          .max(64)
          .describe("Short kebab-case name, e.g. weekly-metrics-report"),
        description: z.string().min(5).max(300).describe("One line: when to use this skill"),
        body: z.string().min(20).max(20_000),
      },
      async (input) => {
        const skill = await saveSkill({
          ...input,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
        });
        return text(`Saved skill "${skill.name}".`);
      },
    ),

    tool(
      "skill_delete",
      "Delete a skill that is no longer useful.",
      { name: z.string() },
      async ({ name }) =>
        (await deleteSkill(ctx.workspaceId, name)) ? text("Deleted.") : error("No such skill."),
    ),
  ];
}
