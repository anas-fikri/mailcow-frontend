# Current Task

Status: COMPLETED
Task ID: 20260904-E2E-NOTJUNK
Updated At: 2026-09-04T11:45:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Add a browser E2E for the Junk folder 'Bukan Spam' (markMessagesAsNotJunk) flow, wire it into the runner, and validate against production.

## Result
- **`scripts/e2e-notjunk-browser.mjs`** — rantai penuh:
  seed via session browser (compose → send ke diri sendiri → moveMessages ke Junk,
  persis flow native SOGo) → UI: buka folder Spam → klik "Bukan Spam" per-baris
  (ShieldCheck) → **row hilang dari Junk** (regresi bug lama: POST 204 tanpa move) →
  **muncul di INBOX** → **reload penuh**: tetap di INBOX & tidak kembali ke Junk
  (persist server) → cleanup INBOX/Junk/Sent. **3 run PASS berturut-turut** (idempoten).
- **Runner** (`scripts/e2e-browser-runner.sh`): pilihan baru `notjunk`, `all` kini
  menjalankan 4 test; cleanup expunge INBOX+Junk+Sent.
- **Perbaikan infra diag (temuan penting)**: `_sogo_static_view` di server ini adalah
  TABEL FISIK — `sogo_view` tidak ada; SOGo auth langsung ke situ dgn hash BLF-CRYPT
  dari `mailbox.password`. diag2 kehilangan row-nya → login 403 walau mailbox aktif.
  Diperbaiki via INSERT mailcow-style + flush memcached; enable block runner direvisi
  ke mekanisme yang benar (skrip lama pakai UPDATE sogo_view yang tidak berpengaruh).
- Residue Sent dari E2E mail sebelumnya (5 email) dibersihkan; ke depan semua cleanup
  menyapu tiga folder.
- Server akhir: active=0, INBOX=0, Junk=0, Sent=0. Unit suite **80/80 PASS**.

## Follow-up
- Jalankan `SERVER=deploy-mail scripts/e2e-browser-runner.sh` (all = 4 test) sebelum
  rilis berdampak.
- Label sidebar "Spam" (bundel) vs "Junk/Spam" (source) menyimpang — sekadar dokumentasi,
  tidak diubah karena hanya kosmetik.
