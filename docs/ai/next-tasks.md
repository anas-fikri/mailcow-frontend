# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:16:57Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Snooze di-migrasi ke schema v3 folder-scoped {[folderId]:{[uid]:wake}} — UID SOGo per-folder membuat entri snooze flat (v2) yatim saat pesan di-archive (false-positive sembunyikan pesan baru dgn UID reuse). executeRules terima isExcluded(msg) utk skip pesan tersnooze (deferral eksplisit user). unsnoozeMessages membersihkan entri saat move/delete/junk/archive + bump tick. Migrasi versi per-domain via readStorage(base, scope, 3) tanpa ubah STORAGE_VERSION global. 49/49 test PASS, deploy live terverifikasi hash.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
