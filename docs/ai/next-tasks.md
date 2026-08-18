# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T15:00:54Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: React #310 ROOT CAUSE: contactNameRef/contactEmailRef/contactPhoneRef (useRef) were declared AFTER early return at line 337 (if (!msgId) return null). React sees different hook count between renders → Rules of Hooks violation → React #310. Fix: move all useRef to BEFORE early returns.
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
