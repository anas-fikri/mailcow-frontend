# Current Task

## 2026-08-27 — Bug hunt round 2 + Mobile UX + Quick Reply

### Bugs ditemukan & diperbaiki:

1. **theme-init.js tidak set `data-theme` attribute** — hanya set class `.dark`/`.light`
   - Fix: tambah `document.documentElement.setAttribute('data-theme', 'dark'|'light')` di theme-init.js

2. **Schedule picker `datetime-local` min timezone salah** — `toISOString()` kembalikan UTC tapi `datetime-local` expects local time
   - Fix: gunakan `getFullYear()`, `getMonth()`, etc untuk format lokal

3. **`toggleSelectAll` pakai `messages` (SEMUA) bukan `sortedMessages` (yang TAMPIL)**
   - Bug: user filter "belum dibaca" → klik "Pilih Semua" → SEMUA pesan terpilih termasuk yang sudah dibaca
   - Fix: `toggleSelectAll` sekarang pakai `sortedMessages`

4. **Sidebar collapse state tidak persisten** — reset ke false saat reload
   - Fix: persist ke `localStorage('pcp_sidebar_collapsed')` + `useCallback`

### Mobile UX:

5. **BottomNav tidak ada safe-area** — iPhone notch/home indicator menimpa nav
   - Fix: tambah `paddingBottom: env(safe-area-inset-bottom, 0px)`

6. **ComposeModal footer tidak ada safe-area** — tombol Kirim terpotong di iPhone
   - Fix: tambah `paddingBottom: max(12px, env(safe-area-inset-bottom, 0px))`

### Fitur baru:

7. **Quick reply dari daftar email** — tombol Reply di hover action bar (desktop)
   - Fetch detail pesan + buka compose langsung dengan data reply
   - Pattern Gmail: klik Reply di baris email tanpa buka reader

### Status: 58/58 PASS, build OK, belum deploy.
