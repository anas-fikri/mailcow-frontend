# Current Task — Audit overlap elemen/ikon (dinamis, semua viewport)

## Status: Selesai (menunggu commit/push/deploy)

## Temuan & Perbaikan

### Bug 1 — Event kalender overlap di slot jam sama (week/day view)
Dua event yang mulai di jam yang sama di-render `absolute left-1 right-1` (full-width) → **saling menimpa total**.
**Fix:** helper murni `layoutOverlappingEvents` di `src/lib/calendarEvents.js` (greedy column assignment: event non-overlap → full-width; overlap → side-by-side, width = 100/maxCols). Dipakai di week view + day view (`slotLayouts`), style `left: calc(X% + 2px)` / `width: calc(Y% - 4px)`.

### Bug 2 — Baris "Kepada" di ComposeModal overflow di lebar sempit
Label (64px) + input (min 150px) + tombol Cc/Bcc (≈90px) = 304px > inner modal mobile (280px @ 320px) → tombol Cc/Bcc terdorong/terpotong, berpotensi menimpa chip.
**Fix:** `flex-wrap` di baris Kepada — tombol pindah ke baris bawah saat sempit.

### Bug 3 — Footer compose: tombol Kirim bisa terdorong
Cluster kiri (paperclip + format + signature + status) + Kirim di `justify-between` tanpa wrap → di 320px Kirim terpotong.
**Fix:** footer `flex-wrap gap-y-2`, cluster kiri `flex-1 min-w-0 flex-wrap`, Kirim `shrink-0`.

### Audit lain (aman — tidak diubah)
- Bulk toolbar: `flex-wrap gap-2` ✓
- Reader toolbar: `flex-wrap gap-2` ✓
- Preferences password inputs: `pr-10`/`pr-20` (teks stop sebelum ikon) ✓
- RulesPage/StatsPage/Calendar month grid: min-w-0/truncate/shrink-0 ✓
- Flag/snooze popover: clamp viewport ✓
- Conversation avatar stack: `relative` z-order benar ✓
- Calendar month: slice 3 + "+N lagi" ✓

## Test
- `test-calendar-events` +13 (layoutOverlappingEvents: overlap→kolom, berurutan→full, tumpukan 3, single, null aman)
- `test-a11y` +5 (wiring layout di Calendar, no full-width tersisa)
- `test-draft-compose` +4 (flex-wrap Kepada, footer wrap, kirim shrink-0)
- **55/55 PASS** · build OK

## Next
- Commit + push (tunnel) + deploy.
