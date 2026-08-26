# Current Task — Drag scope occurrence: pindah SATU kejadian (bukan seri)

## Status
Selesai ✅ — drag occurrence kini memindahkan SATU kejadian (exception RECURRENCE-ID via occurence{ts}); Shift+drag mempertahankan jalur lama (pindah seluruh seri). 55/55 test PASS, live di produksi, ter-push.

## Implementasi
- `handleDragStart(ev, e)` → `dragEvRef = { ev, series: !!e.shiftKey }` (semua 5 view meneruskan native event).
- `handleDrop`: occurrence && !series → payload `{ editScope: 'single', occurrenceId, repeat: null, repeatTouched: false }` → handleUpdateEvent routing scope single ke `occurence{ts}` (repeat tidak dikirim — mengubah pola seri). Shift+drag / event biasa → jalur lama (resolve repeat master via /view).
- Toast hasil: "Kejadian diperbarui" (single) vs "Event diperbarui" (seri).

## Next
- Verifikasi browser: drag occurrence → hanya kejadian itu pindah; Shift+drag → seluruh seri pindah.
- Pertimbangkan hint visual saat drag (scope yang sedang aktif).
Status: COMPLETED
Updated At: 2026-08-26T14:18:09Z
