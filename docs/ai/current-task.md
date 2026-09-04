# Current Task

Status: COMPLETED
Task ID: 20260904-SPACED-FOLDER
Updated At: 2026-09-04
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Fix "Parameter folder tidak valid." pada operasi folder berspasi di webmail, lalu lindungi dengan E2E browser.

## Result
- Akar: guard keamanan `src/lib/pathSegment.js` whitelist `A-Za-z0-9@._%+~%-` menolak SPASI — produksi punya puluhan folder user berspasi ("INBOX/Pak Eriawan", "Team KAC 3 - Tuta", "Deleted Items", dst).
- Fix: whitelist diperluas ke RFC 3986 pchar + spasi; tetap menolak traversal (`..`), `%2F`, karakter kontrol, escape ilegal. Kontrak produksi terverifikasi: SOGo mengirim spasi MENTAH di path folder JSON (bukan %20).
- Deploy: `SERVER=deploy-mail ./deploy.sh` — bundle live `api-AIxtT8el.js` memuat guard baru (guard lama 0 match di chunk live).
- E2E baru `scripts/e2e-spaced-folder-browser.mjs` (runner pilihan `spaced`, `all` = 6 test): buat subfolder berspasi via UI → pilih 2 email → toolbar "Pindah ke..." (flow asli; tidak ada drag & drop di MailPage) → buka folder → reload persist → hapus folder → sapu email INBOX/Junk/Sent. 2 run PASS idempoten.
- Validasi: unit suite 81/81; server bersih (0 folder uji, INBOX/Junk/Sent = 0, diag2 disabled).

## Follow-ups
- Push commits ke GitLab (tunnel wg0) bila diminta.
- Pertimbangkan audit guard serupa di path non-folder (contact/calendar URL segments).
