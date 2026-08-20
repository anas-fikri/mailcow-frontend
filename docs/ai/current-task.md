# Current Task

Status: COMPLETED
Task ID: 20260820-104931-250388
Started At: 2026-08-20T10:49:31Z
Updated At: 2026-08-20T10:49:59Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: perbaiki kalender tidak bisa buat event (action name + field iCal SOGo salah)

## Goal Link
Goal ID: G-001 (keamanan & fungsional webmail)
Sub-goal ID: G-001.S-009 (fitur webmail)

## Root cause
Kalender gagal buat/update event karena `src/lib/api.js` memakai kontrak SOGo yang salah:
1. Action name `saveAsappointment` (huruf kecil 'a') → SOGo case-sensitive, action asli
   `saveAsAppointment` (capital A). Verifikasi dari SOGo `Component.service.js`
   (`'saveAs' + type.capitalize()`).
2. Field payload memakai nama kolom DB `c_title`/`c_location`/`c_description`/`c_isallday`/
   `c_partmails`/`c_partstates`, padahal SOGo `saveAsAppointment` membaca field iCal:
   `summary`/`location`/`comment`/`isAllDay`/`attendees` (array). Verifikasi dari
   `iCalEntityObject+SOGo.m` + `iCalEvent+SOGo.m` (`setAttributes:inContext:`).

## Changes
- **`src/lib/api.js`:**
  - `newEventGuid` robust: baca `data.id || data.uid || data.name || data`, wajib string.
  - Helper `buildAppointmentBody(event)` → field iCal yang benar; attendees (string koma)
    → array `{email, name, role: 'REQ-PARTICIPANT', partstat: 'NEEDS-ACTION'}`;
    all-day tanpa startTime/endTime.
  - `createCalendarEvent` → POST `/saveAsAppointment`; `updateCalendarEvent` → POST `/save`.
- **`scripts/test-calendar-api.mjs` (baru):** assert action name capital A, field iCal,
  tidak ada c_*, attendees→array, all-day tanpa time, newguid plain-string, update `/save`.
- **`package.json`:** tambah `test:calendar-api`.

## Validation
- 30/30 test PASS (baru `test:calendar-api`), `npm run build` OK.

## Next Steps
- Commit + push + deploy frontend (SERVER=deploy-mail ./deploy.sh; backend tak berubah).

## Risks
- Tidak ada — frontend-only (api.js). Perilaku fetch/list event tidak diubah.
