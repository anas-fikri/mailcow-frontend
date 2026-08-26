# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T10:29:37Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Rotasi audit PreferencesPage/signatures: (1) race one-time migration — migratedRef di-set sebelum data async (fetchPreferences) tiba → migrasi di-skip selamanya; fix: guard SEBELUM dengan deps [email, prefs]. (2) Signature HTML aman: selalu lewat DOMPurify PURIFY_CONFIG + hardenAnchorNode di 3 titik (inject editor, paste, chokepoint send) — tidak perlu sanitize di storage layer. (3) syncToSogo = aksi manual, idempotent, placeholder legacy tidak ter-sync. 119 a11y assertions, 55/55 PASS, live di produksi.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
