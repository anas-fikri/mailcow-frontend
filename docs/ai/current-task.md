# Current Task

## Task: Konflik duplikat event kalender — event sama di 2 tanggal / double-click create

**Status: SELESAI (47/47 test PASS, live)** → commit + push + deploy.

## Ringkasan
Dua jalur duplikasi event kalender ditemukan & diperbaiki:
1. **Double-submit create/delete** — handleSave/handleDelete tanpa re-entry
   guard; tombol `disabled={saving}` hanya efektif setelah re-render, jadi
   Enter auto-repeat / klik ganda di tick yang sama memanggil handleSave dua
   kali → masing-masing `newEventGuid` = **dua event dibuat**.
2. **Parsing eventsblocks tanpa dedup** — baris duplikat (id+start+calendar
   sama) dirender dua kali di grid.

## Perubahan

### Fix 1 — Re-entry guard di EventModal (`savingRef`, sinkron)
```js
const savingRef = useRef(false);
if (savingRef.current) return; // double-submit
savingRef.current = true;
setSaving(true);
... finally { setSaving(false); savingRef.current = false; }
```
Berlaku di `handleSave` (create + edit) dan `handleDelete`. Guard via ref
(sinkron), bukan state (async) — melindungi double-fire di tick yang sama.

### Fix 2 — Dedup parser `src/lib/calendarEvents.js` (baru)
Parser murni `parseCalendarEvents(raw)` dipindah dari api.js + dedup baris
duplikat by `id|start|calendar`:
- **Recurring TIDAK di-dedup** — SOGo meng-expand recurring jadi satu baris
  per occurrence (start berbeda); semua occurrence dipertahankan.
- **Cross-calendar TIDAK di-dedup** — event yang sama di 2 kalender tetap 2.
- Normalisasi number vs string start utk dedup yang konsisten.
- Guard baris rusak (blocks non-array, baris non-array/null) — tanpa ini satu
  baris korup bisa merusak seluruh kalender.

## Test
- **Baru `test:calendar-events`** (18 assertions): dedup persis → 1; recurring
  3 occurrence → 3; cross-calendar → 2; number vs string start → 1; raw
  null/string/blocks-rusak/baris-rusak → [] tanpa crash; field mapping
  (attendees newline→koma, classification, all-day/recurring, title fallback);
  4 assertion statis EventModal (savingRef + guard save/delete + reset).
- **47/47 test PASS** · `npm run build` OK

Status: COMPLETED
Updated At: 2026-08-26T01:43:52Z
