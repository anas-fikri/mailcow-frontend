# Current Task

Status: COMPLETED
Task ID: 20260904-BROWSER-E2E-CONTACT
Updated At: 2026-09-04T08:45:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Add a browser-level regression test for creating a contact end-to-end in the SPA.

## Result
- Test baru `scripts/e2e-contact-browser.mjs` (Puppeteer + Chrome for
  Testing): login UI diag2 → halaman Contacts → Tambah → isi form → Simpan →
  kontak muncul di daftar → **TETAP ADA setelah reload penuh** (bukti persist
  di server — regresi bug data loss `_new_`) → cleanup via UI (Hapus Kontak)
  → tanpa pageerror React. 2x run berturut-turut PASS.
- Lingkungan: mesin ini tidak punya GTK/X11 stack & tanpa sudo — dependensi
  Chrome dipenuhi user-space via `apt-get download` + `dpkg-deb -x` ke
  `~/.local/chrome-libs` (25 paket, 2 lapis deps) + `LD_LIBRARY_PATH`.
  `findChrome()` otomatis memilih binary cache puppeteer terbaru; override
  via `CHROME_PATH`. `ensureChromeLibs()` set LD_LIBRARY_PATH bila ada.
- Skala run: unik per run (`E2E Browser <stamp>` / `e2e.browser.<stamp>@…`),
  anti duplikat, cleanup otomatis via UI; sisa kartu uji & phantom `_new_`
  di diag2 dibersihkan via batchDelete (204, personal = 0).
- Catatan: test ini butuh diag2 AKTIF; jalankan bagian enable dari
  `scripts/capture-mail-golden.sh` dulu atau set `DIAG_ENABLED=1` bila aktif.
