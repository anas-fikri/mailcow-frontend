# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T11:01:37Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Commit + push + deploy frontend (backend tak berubah).
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Recurrence kompleks (byday/byhour) tak diedit di UI tapi dipertahankan; hanya daily/weekly/
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 30/30 test PASS, `npm run build` OK.
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Recurring event SOGo: payload kontrak iCalRepeatableEntityObject+SOGo.m — {frequency, interval, [count], [until], [days], [monthdays], [months], [dates]}. frequency lowercase daily/weekly/monthly/yearly + spesial bi-weekly (->weekly interval 2), every weekday, custom. EventModal: UI freq+interval+end(never/count/until); prefill dari event.repeat (/view); pola kustom dipertahankan via originalRepeatRef (anti data-loss bila user cuma edit judul); repeatTouchedRef menandai apakah kontrol diubah. buildAppointmentBody sertakan repeat; fetchCalendarEventDetail return repeat: d.repeat.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
