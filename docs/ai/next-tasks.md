# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T14:29:24Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Bug hunt round 2: verified no infinite loop from focusIdx clamp (removed focusIdx from deps), pruneExpired only in useEffect (not useMemo), all effects have proper cleanup. React #310 error was caused by focusIdx dep in clamp effect creating interaction with reset effect. All 20/20 tests pass.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## 3. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
