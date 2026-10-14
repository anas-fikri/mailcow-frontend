---
id: T-e2f4
title: 'Webmail: ikon pengulangan (↻) pada event berulang di grid kalender'
status: done
profile: standard
created: "2026-08-20T11:05:11Z"
updated: "2026-08-20T11:05:26Z"
legacy:
  source: docs/ai/tasks/20260820-111241-959627.previous.md
  status: COMPLETED
  v1_id: 20260820-110511-162155
---

## Objective
Webmail: ikon pengulangan (↻) pada event berulang di grid kalender

## Goal Link
Goal ID: G-001 (keamanan & fungsional webmail)
Sub-goal ID: G-001.S-009 (fitur webmail)

## Changes
- **`src/lib/api.js`:** `fetchCalendarEvents` memetakan `c_iscycle` → `isRecurring`
  (boolean, dari kolom DB SOGo yang 0/1).
- **`src/pages/CalendarPage.jsx`:** ikon `Repeat` (lucide) ditampilkan di semua
  render event berulang: month view chip, week view (hourly + all-day), day view
  (hourly + all-day), dan side panel list.

## Validation
- 30/30 test PASS (test:calendar-api + mapping isRecurring & attendees), `npm run build` OK.

## Next Steps
- Commit + push + deploy frontend (backend tak berubah).

## Risks
- Tidak ada.
