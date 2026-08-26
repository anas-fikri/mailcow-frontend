# Current Task — Edit/hapus SATU occurrence event berulang (recurrence_id SOGo 5)

## Status
Selesai ✅ — kontrak recurrence SOGo 5 terverifikasi dari source (UI SOGo 5.12.10 Component.service.js/Resource.service.js + SOGoCalendarComponent.m/SOGoComponentOccurence.m), 55/55 test PASS, live di produksi, ter-push.

## Kontrak (diverifikasi dari source, bukan tebakan)
- eventsblocks mengirim `c_recurrence_id` per baris occurrence = unix detik start occurrence (all-day: GMT midnight).
- Path occurrence SOGo 5: `Calendar/{cal}/{uid}/occurence{unixSec}/view|save|delete` — server resolve via `SOGoCalendarComponent.lookupName` (hasPrefix "occurence" + substringFromIndex:9 + intValue).
- Save occurrence = detached exception RECURRENCE-ID (repeat WAJIB null — mengirim repeat mengubah pola SERI).
- Delete occurrence = EXDATE di master (SOGoComponentOccurence.prepareDelete).
- Tanpa segmen occurrence, save/delete menyentuh SELURUH seri.

## Implementasi
1. `calendarEvents.js`: parse `c_recurrence_id` → `occurrenceId` (toleran string, tolak 0/empty).
2. `api.js`: helper `occurrenceSegment()` → `occurence{ts}` dipakai di updateCalendarEvent/deleteCalendarEvent/fetchCalendarEventDetail.
3. `EventModal.jsx`: scope selector "Kejadian ini saja" vs "Semua kejadian" (default single saat dibuka dari occurrence); scope single memaksa repeat null + kontrol pengulangan disabled; delete scope-aware.
4. `CalendarPage.jsx`: handleUpdateEvent route scope single → save ke occurence{ts} (tanpa safety-net repeat); handleDeleteEvent occurrence-aware; scope chooser hapus di popup detail (bukan window.confirm generik); openEditModal fetch detail occurrence; fallback edit occurrence saat /view gagal (block hanya master).

## Next
- Verifikasi browser: buat event berulang mingguan → edit/hapus satu kejadian (pastikan kejadian lain tetap), edit semua kejadian, hapus seluruh seri.
- Drag occurrence (saat ini = pindah seri) bisa jadi pilihan scope berikutnya.
