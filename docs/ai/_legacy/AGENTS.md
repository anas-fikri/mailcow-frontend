<!-- ai-toolkit:protocol:start -->
## Shared AI project context (ai-toolkit)

Before making meaningful changes, read these repository-local files:

- `docs/ai/project-context.md` — project purpose, stack, constraints
- `docs/ai/operating-model.md` — lifecycle, goals, and source-of-truth rules
- `docs/ai/goals.md` — goal/sub-goal hierarchy, success criteria, and status
- `docs/ai/application-map.md` — verified application surfaces and gaps
- `docs/ai/current-task.md` — active objective and next steps
- `docs/ai/handoff.md` — latest work handed off by another agent
- `docs/ai/knowledge.md` — durable findings discovered while completing tasks
- `docs/ai/next-tasks.md` — evidence-based suggestions for the next task
- `docs/ai/decisions.md` — durable architecture/product decisions
- `ai-state.json` — machine-readable project state, when present

**ENGINE STANDARD (WAJIB — dari ~/.ai-toolkit/conventions/):**
- `STANDARD_DEVELOPMENT.md` — task lifecycle (5 stage + bug hunt loop), rotasi fokus, bukti per task, grounding rules anti-halusinasi, onboarding checklist. Berlaku SEMUA project.

Keep the files current while working. Update `docs/ai/current-task.md` at
start/close, append important handoffs to `docs/ai/handoff.md`, and record
durable decisions and newly discovered project knowledge in
`docs/ai/decisions.md` and `docs/ai/knowledge.md`. Every completed task must
call `ai-close --knowledge "…"` with findings about code, infra, CI/CD,
operations, constraints, bugs, or validation—even when the finding is that no
new durable knowledge was discovered. Treat these files as the
project's shared source of truth across Codex, OpenCode, Claude, and other AI
tools. Use `.ai-toolkit/project.env` for automation/deploy settings.
<!-- ai-toolkit:protocol:end -->
