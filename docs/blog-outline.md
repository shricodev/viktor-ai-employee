# Blog post outline: building an open-source AI employee for Slack

Working title: **"I built an open-source Viktor: an AI employee for Slack with the Claude Agent SDK and Composio"**

## 1. Hook (150 words)
- AI "coworkers" like Viktor went from novelty to products teams pay for. What actually sits under one?
- Demo GIF: mention in Slack → live progress → approval card → PDF report in the thread.
- Promise: the full architecture, the hard parts, and a repo you can deploy.

## 2. What makes something an "employee" and not a chatbot
- It does the work instead of describing it: real apps, real files.
- It has its own computer.
- It remembers and gets better (memory + skills).
- It works without being asked (schedules, triggers, watched channels).
- It asks before doing anything risky.
- Map each of these to a section of the post.

## 3. Architecture in one diagram
- The gateway / worker split, and why Slack's 3-second ack forces it.
- The Claude Agent SDK as the agent loop: why not hand-roll one (sessions, hooks, MCP, budgets).
- Composio as the integration layer: one session per workspace, MCP, meta tools.

## 4. The hard parts (the meat of the post)
1. **1,000 integrations without 1,000 tool schemas.** Composio's search / multi-execute / manage-connections meta tools keep the context small. Turning `COMPOSIO_MANAGE_CONNECTIONS` output into a Slack button with a `PostToolUse` hook.
2. **Approvals that the model can't talk its way around.** `canUseTool` + a verb classifier + Redis pub/sub between a button click and a paused agent. Code: `decide()` and its tests.
3. **Giving the agent a computer safely.** Turning off built-in Bash/Write, a hardened Docker sandbox, and tar-based file transfer. Showing the isolation tests.
4. **Resumable conversations across a fleet of workers.** Mirroring SDK transcripts into Postgres with `SessionStore`; cost deltas on resumed sessions.
5. **Memory that's actually useful.** Hybrid full-text + pgvector with reciprocal rank fusion, and agent-written skills.
6. **Proactive without being annoying.** Cheap Haiku triage with structured output, rate limits, and "ignore" as the default.
7. **Prompt caching on a multi-tenant system prompt.** Static core prompt, `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`, and per-turn context in the user message.

## 5. Evals
- Behaviour checks instead of string matching: right tools used, risky actions gated, prompt-injection file ignored.
- Cost per scenario.

## 6. Running it yourself
- `pnpm chat` in the terminal, then the Slack manifest and `docker compose --profile app up`.

## 7. What's next
- Teams, per-user private mode, internal web apps from the sandbox.

## Assets to capture
- [ ] GIF: report request end to end
- [ ] Screenshot: approval card before and after
- [ ] Screenshot: App Home
- [ ] Screenshot: connect button flow
- [ ] Terminal recording of `pnpm chat` and `pnpm eval`
