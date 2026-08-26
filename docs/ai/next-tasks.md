# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T07:29:38Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Kalender: helper tanggal lokal baru src/lib/dateFormat.js — jangan pernah pakai toISOString() utk tanggal input (UTC; WIB +7 jam 00:00-06:59 = hari sebelumnya → klik sel/event 02:00/drag dini hari pindah sehari). eventsOnDay overlap utk multi-day (end eksklusif). Drag recurring harus fetch /view utk pola repeat (grid eventsblocks tidak memuat repeat, hanya c_iscycle); keterbatasan: edit occurrence tunggal = edit seluruh seri. 54/54 PASS, live terverifikasi hash.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
