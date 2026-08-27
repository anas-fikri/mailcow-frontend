## 2026-08-27 — Bug Hunt Round 2 + Mobile UX + Quick Reply

### Selesai:
1. **theme-init.js data-theme** — `theme-init.js` sekarang set `data-theme="dark|light"` (sebelumnya hanya class → CSS selectors `[data-theme]` tidak work sebelum React mount)
2. **datetime-local min timezone** — Schedule picker `min` attribute sekarang pakai local time (sebelumnya UTC → jam min salah 7 jam untuk GMT+7)
3. **toggleSelectAll filter fix** — "Pilih Semua" sekarang hanya pilih pesan yang TAMPIL (setelah filter flag/category/unread/attachment), bukan semua pesan di folder
4. **Sidebar collapse persist** — Collapse state disimpan di `localStorage('pcp_sidebar_collapsed')`, tidak reset saat reload
5. **BottomNav safe-area** — `env(safe-area-inset-bottom)` untuk iPhone notch/home indicator
6. **ComposeModal footer safe-area** — `max(12px, env(safe-area-inset-bottom))` untuk tombol Kirim di iPhone
7. **Quick reply dari daftar email** — Tombol Reply di hover action bar (desktop), fetch detail + buka compose langsung

### Deploy: ✅ Live (commit 3046188)
### Git push: ⏳ Timeout — push manual diperlukan

### Next tasks:
- AI-loop bug hunt round 3: edge case auto-archive vs snooze, multi-tab race, dark mode auto switching di Safari
- Quick reply di mobile (tambahan tombol di baris email sentuh)
- Pull-to-refresh untuk inbox mobile
