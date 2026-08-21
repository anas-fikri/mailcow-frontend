# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-21T10:18:53Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Storage schema versioning: semua domain localStorage (pcp_signatures, pcp_snooze, flag_colors, auto_archive_rules, sogo_prefs, pcp_prefs) dimigrasi ke key *_v2_* dengan fallback chain readStorage() + persistNormalized() di storageMigrate.js; key v1 dihapus hanya bila tulis v2 sukses; JSON literal 'null' dianggap tidak ada data. 39/39 test PASS, build OK.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 18 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
