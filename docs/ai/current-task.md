# Current Task

## Status: SELESAI ✅

**Terapkan pola `min-w-0`/`truncate`/`shrink-0` ke header Kalender & Kontak**

Konsistensi dengan perbaikan posisi ikon MailPage (commit `e259df2`).

### Perubahan
- **CalendarPage**: wrapper judul `min-w-0 flex-1` + judul `truncate`; ViewSwitcher dibungkus `shrink-0`; cluster aksi navigasi `shrink-0`; judul periode `shrink-0 whitespace-nowrap`.
- **ContactsPage**: wrapper judul `min-w-0 flex-1` + judul `truncate` + badge hitung `shrink-0`; tombol Tambah `shrink-0`; cluster filter `shrink-0`.
- **test-a11y**: +7 assertion statis → 80 assertions total.

### Validasi
- `npx vite build` OK
- 53/53 test PASS (node + bash)
- Deploy live terverifikasi hash
