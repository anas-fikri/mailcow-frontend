# AI Toolkit Operating Model

## Goal

Make project work resumable across AI providers, machines, and sessions by
keeping the durable context in the repository and treating external memory as
a secondary index.

## Source of Truth

1. `docs/ai/project-context.md` — what the project is and its constraints.
2. `docs/ai/goals.md` — goal/sub-goal hierarchy and measurable outcomes.
3. `docs/ai/current-task.md` — the active objective and next step.
4. `docs/ai/handoff.md` — what the previous agent changed and validated.
5. `docs/ai/decisions.md` — durable decisions and tradeoffs.
6. `ai-state.json` — machine-readable state for agents and automation.
7. `.ai-toolkit/project.env` — local project automation settings.

Optional capabilities such as Browser MCP are configured in
`.ai-toolkit/project.env` and may be different on each machine.

## Session Lifecycle

1. `ai-init` creates or repairs the protocol.
2. An AI reads `AGENTS.md`, this document, and the current context files.
3. `ai-start` marks the active objective in Markdown and `ai-state.json`.
4. Work is implemented and validated; important decisions are recorded.
5. `ai-close` writes the handoff and updates machine-readable progress.
6. `ai-commit`, `ai-push`, or `ai-deploy` performs the requested delivery step.

## Portability Rules

- Repository files are authoritative and must remain understandable without
  Uteke or any particular AI provider.
- Uteke stores concise cross-session summaries, never secrets.
- Provider-specific prompts are adapters; they must consume the same project
  context rather than create a competing state format.
- MCP endpoints are capabilities, not project state. Keep their names and
  dynamic URLs in config, and never store credentials in repository files.
- `ai-state.json` is operational metadata, not a replacement for explanation
  in Markdown.

## Goal Tracking

`goals.md` is the canonical human-readable hierarchy. Every active task
should link to one `Goal ID` and one `Sub-goal ID` in `current-task.md`.
Keep success criteria and validation evidence on the sub-goal; keep transient
execution details in `current-task.md` and `ai-state.json`.
