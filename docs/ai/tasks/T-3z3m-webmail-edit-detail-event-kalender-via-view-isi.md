---
id: T-3z3m
title: 'Webmail: edit detail event kalender via /view (isi lengkap: attendees + classification)'
status: done
profile: standard
created: "2026-08-20T10:56:02Z"
updated: "2026-08-20T10:56:23Z"
legacy:
  source: docs/ai/tasks/20260820-110117-165829.previous.md
  status: COMPLETED
  v1_id: 20260820-105602-244471
---

## Objective
Webmail: edit detail event kalender via /view (isi lengkap: attendees + classification)

## Goal Link
Goal ID: G-001 (keamanan & fungsional webmail)
Sub-goal ID: G-001.S-009 (fitur webmail)

## Root cause
Edit event sebelumnya memakai data ringkas `eventsblocks` yang TIDAK memetakan
attendees/classification → membuka editor lalu simpan akan MENGHAPUS peserta event
(karena buildAppointmentBody tak kirim attendees) dan menurunkan klasifikasi jadi public.

## Changes
- **`src/lib/api.js`:**
  - `fetchCalendarEventDetail(sogoToken, eventId)` → GET `/Calendar/{id}/view`, parse
    field iCal lengkap (`summary`/`location`/`comment`/`classification`/`attendees`
    array/`startDate`/`endDate` ISO/`isAllDay`). attendees array → string `email, email`.
  - `fetchCalendarEvents` sekarang juga memetakan `c_partmails` (newline) → `attendees`
    dan `c_classification` (0/1/2) → `public/private/confidential` (fallback, anti-wipe).
  - `buildAppointmentBody` normalisasi `classification` (angka/string) + pertahankan
    klasifikasi event yang diedit.
- **`src/pages/CalendarPage.jsx`:** `openEditModal` async — fetch detail via /view dulu,
  merge `{...ev, ...detail}`, lalu buka editor; fallback ke data ringkas bila gagal;
  spinner (`editingId`) pada tombol edit di popup detail.
- **`src/components/EventModal.jsx`:** `handleSave` menyertakan `classification` asli
  saat edit (jadi tak di-reset ke public).
- **`scripts/test-calendar-api.mjs`:** + kasus `/view` parsing, classification dipertahankan.

## Validation
- 30/30 test PASS, `npm run build` OK.

## Next Steps
- Commit + push + deploy frontend (backend tak berubah).

## Risks
- Parsing date `/view` pakai `Date.parse` (ISO) → unix seconds, konsisten dgn eventsblocks.
