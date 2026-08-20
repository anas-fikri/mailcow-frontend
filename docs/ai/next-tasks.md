# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T10:50:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Commit + push + deploy frontend (SERVER=deploy-mail ./deploy.sh; backend tak berubah).
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Tidak ada — frontend-only (api.js). Perilaku fetch/list event tidak diubah.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 30/30 test PASS (baru `test:calendar-api`), `npm run build` OK.
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Kalender tidak bisa buat event: src/lib/api.js memakai kontrak SOGo salah. (1) Action name 'saveAsappointment' harusnya 'saveAsAppointment' (capital A, case-sensitive) — dari SOGo Component.service.js 'saveAs'+type.capitalize(). (2) Payload pakai kolom DB c_title/c_location/c_description/c_isallday/c_partmails/c_partstates, padahal SOGo saveAsAppointment membaca field iCal summary/location/comment/isAllDay/attendees(array) — dari iCalEntityObject+SOGo.m & iCalEvent+SOGo.m setAttributes:inContext:. attendees: string koma -> array {email,name,role:'REQ-PARTICIPANT',partstat:'NEEDS-ACTION'}. update pakai action 'save' (benar). newguid response JSON {id} atau plain string. SOGo field date: startDate/startTime/endDate/endTime (string YYYY-MM-DD/HH:MM) + isAllDay bool.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
