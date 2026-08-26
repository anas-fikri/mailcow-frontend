# Current Task

## Status: SELESAI ✅

**Ai-loop rotasi kalender — recurring & timezone/DST: 3 bug diperbaiki**

### Bug 1 (KRITIS) — Tanggal pakai toISOString() (UTC) padahal waktu lokal
`toDateStr`/`fmtInputDate` (EventModal) + `buildDroppedEventData` (calendarDrop)
memakai `toISOString().slice(0,10)` → UTC. Untuk WIB (+7), jam 00:00–06:59
= tanggal UTC hari SEBELUMNYA. Dampak nyata:
- klik sel kalender (midnight lokal) → modal terisi **tanggal kemarin**
- edit event jam 02:00 → tersimpan **sehari lebih awal**
- drag & drop ke slot dini hari → mendarat di **hari sebelumnya**
**Fix:** helper baru `src/lib/dateFormat.js` (`toLocalDateStr`/`toLocalTimeStr`)
memakai komponen getFullYear/getHours (selalu lokal). Dipakai EventModal
(create prefill, edit, view display) + calendarDrop.

### Bug 2 — Event multi-hari hanya muncul di hari mulai
`eventsForDay` filter `s >= dayStart && s <= dayEnd` → event 2 hari hanya
tampil di hari pertama. **Fix:** `eventsOnDay` overlap-based
(`s <= dayEnd && e > dayStart`, end eksklusif) di `calendarEvents.js`;
CalendarPage import dari lib (lokal dihapus).

### Bug 3 — Drag event berulang menghapus recurrence diam-diam
Data grid (eventsblocks) hanya punya `c_iscycle` boolean — `ev.repeat` selalu
undefined → `buildDroppedEventData` set repeat null → SOGo simpan tanpa pola
→ recurrence hilang. **Fix:** `handleDrop` ambil detail via `/view` saat
`ev.isRecurring && !ev.repeat`, gabung `repeat` sebelum simpan.

### Validasi
- Baru `test:date-format` (11 assertion, TZ Asia/Jakarta + America/New_York)
- `test-calendar-drop` +4 (drag 02:00/00:00 WIB — regresi UTC)
- `test-calendar-events` +12 (multi-day span, all-day eksklusif, static drag-recurring)
- **54/54 PASS** · build OK · deploy live terverifikasi hash
Status: COMPLETED
Updated At: 2026-08-26T07:29:38Z
