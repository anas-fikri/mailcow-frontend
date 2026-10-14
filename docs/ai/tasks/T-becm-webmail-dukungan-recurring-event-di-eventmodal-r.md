---
id: T-becm
title: 'Webmail: dukungan recurring event di EventModal (repeat SOGo)'
status: done
profile: standard
created: "2026-08-20T11:01:17Z"
updated: "2026-08-20T11:01:37Z"
legacy:
  source: docs/ai/tasks/20260820-110511-162155.previous.md
  status: COMPLETED
  v1_id: 20260820-110117-165829
---

## Objective
Webmail: dukungan recurring event di EventModal (repeat SOGo)

## Goal Link
Goal ID: G-001 (keamanan & fungsional webmail)
Sub-goal ID: G-001.S-009 (fitur webmail)

## Changes
- **`src/components/EventModal.jsx`:**
  - State pengulangan: `freq` (never/daily/weekly/monthly/yearly), `repeatInterval`,
    `repeatEnd` (never/count/until), `repeatCount`, `repeatUntil`.
  - `applyRepeat()` prefill dari `event.repeat` (dari /view); `bi-weekly` → weekly+interval 2;
    pola kustom (custom/every weekday/byday) dipertahankan via `originalRepeatRef` + banner
    info, tidak diedit di UI.
  - `handleSave` bangun `repeat` sesuai kontrak SOGo `iCalRepeatableEntityObject+SOGo.m`
    (`{frequency, interval, [count], [until]}`); bila user tidak sentuh kontrol, kirim pola
    asli apa adanya (anti data-loss).
- **`src/lib/api.js`:** `buildAppointmentBody` sertakan `repeat`; `fetchCalendarEventDetail`
  return `repeat: d.repeat`.
- **`scripts/test-calendar-api.mjs`:** + assert repeat dikirim/parsing & tak dikirim bila kosong.

## Validation
- 30/30 test PASS, `npm run build` OK.

## Next Steps
- Commit + push + deploy frontend (backend tak berubah).

## Risks
- Recurrence kompleks (byday/byhour) tak diedit di UI tapi dipertahankan; hanya daily/weekly/
  monthly/yearly + interval + count/until yang bisa di-set dari UI.
