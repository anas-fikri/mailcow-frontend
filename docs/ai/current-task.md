# Current Task

Status: COMPLETED
Task ID: 20260905-FLAGCOLOR-E2E-VERIFY
Updated At: 2026-09-05
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Verify migrated flag colors survive after a move between folders using the diag account — end-to-end on production.

## Result
- E2E browser baru `scripts/e2e-flagcolor-browser.mjs` (selector runner `flagcolor`) membuktikan lifecycle penuh di produksi dengan diag2: seed store v2 flat → migrasi otomatis ke v3 `{folderINBOX:{...}}` (+ key v2 dihapus) → warna purple tampil di UI → pindah email uji ke Arsip via tombol Arsip per-baris → purge presisi (uid uji hilang, uid lain utuh) → persist setelah reload → tanpa pageerror.

## Bonus temuan & perbaikan (commit `881f0a1`)
1. **OUTAGE produksi ketahuan & diperbaiki**: MailPage error boundary sejak deploy v3 (`d3e0d0c`) — `flagColorOf`/`setFlagColorOf` di module scope mereferensikan state komponen → ReferenceError saat chunk dimuat → /webmail/mail crash untuk SEMUA user. Helper dipindah ke dalam komponen. Verifikasi deploy md5/string marker tidak menangkap crash runtime — pelajaran: MailPage wajib smoke-render/E2E saat deploy.
2. **Jalur Arsip yang lolos dari purge**: tombol Arsip per-baris panggil `moveMessages` langsung (tanpa purge snooze/flag) → kini lewat `moveMutation`; `archiveMutation` kini purge flag colors juga.
3. **Runner diperkuat**: enable block reset password diag2 (doveadm BLF-CRYPT) — hash eksperimen lama bikin login 403; seed email uji via env `E2E_FC_SUBJECT`; expunge Archive di cleanup.

## Validasi
- Suite unit 82/82 PASS; build produksi bersih; deploy OK + bundle live md5-identik.
- **SEMUA 7 browser E2E PASS berturut-turut** (contacts calendar mail notjunk capture spaced flagcolor) via `scripts/e2e-browser-runner.sh all`.

## Next
- (Opsional) Jadikan smoke-render MailPage sebagai langkah wajib post-deploy (mis. skrip cek cepat yang buka /webmail/mail dgn akun diag sebelum deploy dianggap sukses).