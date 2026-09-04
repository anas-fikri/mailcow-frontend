# Current Task

Status: COMPLETED
Task ID: 20260904-E2E-RUNNER
Updated At: 2026-09-04T10:30:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Wrap all three browser E2Es (contacts, calendar, mail) in one runner script with diag enable/disable automation, then run all three back-to-back to confirm they pass together.

## Result
- **`scripts/e2e-browser-runner.sh [contacts|calendar|mail|all]`** — lifecycle lengkap:
  (1) enable diag2 di server (mailbox active + password statis + static view + flush memcached)
  + seed email pembanding "kemarin 21:38" untuk asersi sort mail E2E (Message-ID unik per run → idempoten),
  (2) jalankan E2E terpilih berurutan (contacts → calendar → mail),
  (3) `trap EXIT` menjamin cleanup (expunge INBOX + disable diag2) **walau test gagal** di tengah.
- `SKIP_ENABLE=1` untuk melewati langkah server bila diag sudah aktif.
- **Verifikasi back-to-back via runner: 3/3 PASS**:
  - contacts: kontak muncul di daftar + persist setelah reload penuh, tanpa pageerror
  - calendar: event muncul di grid + persist, cleanup via API session browser
  - mail: kedatangan terverifikasi + **sort benar (uji index 0 < yesterday index 2 dari 3 baris)** + persist stabil
- Server bersih pasca-run: INBOX diag2 = 0, `active=0`, **0 tabel** kartu/kalender tersisa
  (SOGo auto-drop tabel kosong → tidak ada residue uji).
- Unit suite tidak tersentuh (80/80) — runner ini opt-in, butuh SSH + Chrome.

## Follow-up
- Jalankan `SERVER=deploy-mail scripts/e2e-browser-runner.sh` sebelum setiap rilis berdampak
  (setara "klik manual tiga alur utama" — tapi terdokumentasi dan idempoten).
