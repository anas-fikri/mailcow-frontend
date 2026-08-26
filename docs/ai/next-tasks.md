# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T08:43:38Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Ai-loop menyeluruh: security & robustness bersih (XSS/tabnabbing/input validation solid dari round sebelumnya). 2 bug flow diperbaiki: (1) kalender klik sel bulan mengirim Date midnight → openCreateModal default jam 09:00, week/day kirim hour asli; (2) tutup compose edit-draft tanpa kirim → handleClose hapus copy autosave (draft asli tetap; compose baru tidak dihapus). 54/54 PASS, live (index-Dmd94Swz, CalendarPage-DWieJ8Gk, MailPage-CMVgao9L).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
