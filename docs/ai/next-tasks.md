# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T10:50:03Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Rotasi CalendarPage recurring: (1) data loss: save event recurring tanpa repeat → SOGo menimpa recurrence (pola hilang); semua jalur edit/drag wajib resolve repeat via /view sebelum save atau TOLAK save (safety net: isRecurring && !repeat && !repeatTouched). Edit event berulang harus diblokir saat detail /view gagal — fallback ke data grid (eventsblocks) yang tanpa repeat = pola rusak. (2) Hapus occurrence recurring = hapus SELURUH seri (satu UID) — konfirmasi wajib menyebut scope. (3) Fitur edit/hapus satu occurrence butuh recurrence_id/EXDATE (SOGo 5) — workstream terpisah. 129 a11y assertions, 55/55 PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
