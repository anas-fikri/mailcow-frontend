# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T03:26:21Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Pola interaksi search: (1) search menembus batasan daftar biasa — window bulan + filter snooze di-skip saat searchQuery (pola Gmail), filter tampak tetap berlaku; (2) rules engine yang memindah pesan harus off saat search (early-return + deps); (3) filter yang UI-nya disembunyikan saat mode lain wajib di-reset state-nya (categoryFilter saat search); (4) ekstrak logika window inline ke helper murni (applyMessageWindow di dateGroups.js) agar testable.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
