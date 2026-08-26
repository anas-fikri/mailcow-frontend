# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T01:43:52Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Duplikat event kalender: (1) EventModal double-submit — tombol disabled={saving} (state async) TIDAK melindungi Enter auto-repeat/klik ganda di tick yang sama; handleSave/handleDelete butuh guard re-entry via useRef sinkron (savingRef), bukan state, karena 2x createCalendarEvent = 2x newEventGuid = 2 event. (2) SOGo eventsblocks meng-expand recurring jadi satu baris PER OCCURRENCE (start berbeda) — JANGAN dedup by id saja; dedup benar by id
- Why: start|calendar (normalisasi String utk number vs string), recurring & cross-calendar tetap dipertahankan. Parser dipindah ke src/lib/calendarEvents.js (murni, bisa diuji) + guard baris rusak (blocks/baris non-array) agar satu baris korup tidak merusak kalender. Test test:calendar-events = 18 assertions.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
