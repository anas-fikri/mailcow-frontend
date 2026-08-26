# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T10:04:26Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Race autosave vs tutup modal: guard harus memakai ref flag (closedRef/sentRef) karena promise in-flight tidak bisa dibatalkan — cleanup harus terjadi di sisi async setelah await selesai, bukan hanya di handler sinkron. Juga: payload onReply antar komponen harus membawa composeMode agar konsumen (ComposeModal) bisa pilih signature per mode.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
