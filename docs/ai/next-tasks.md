# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T10:56:23Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Commit + push + deploy frontend (backend tak berubah).
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Parsing date `/view` pakai `Date.parse` (ISO) → unix seconds, konsisten dgn eventsblocks.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 30/30 test PASS, `npm run build` OK.
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Edit event kalender: eventsblocks tidak map attendees (c_partmails newline) & classification (c_classification 0/1/2) -> edit+simpan MENGHAPUS peserta & reset klasifikasi jadi public. Fix: fetchCalendarEventDetail GET /Calendar/{id}/view (field iCal lengkap: summary/location/comment/classification/attendees array {email,name,partstat,role}, startDate/endDate ISO string, isAllDay) -> attendees array jadi string 'email, email'; date pakai Date.parse. buildAppointmentBody normalisasi classification (angka 1/2 -> private/confidential, string divalidasi). CalendarPage openEditModal async fetch+merge {...ev,...detail} + spinner editingId. EventModal handleSave sertakan classification asli. eventsblocks juga di-map attendees+classification sbg fallback anti-wipe.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 9 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
