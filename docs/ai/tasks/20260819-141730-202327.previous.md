# Current Task

Status: COMPLETED
Task ID: 20260819-140923-110737
Started At: 2026-08-19T14:09:23Z
Updated At: 2026-08-19T14:13:57Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: refactor deploy.sh — nginx config single-source (baca configs/site.webmail.custom) + deploy backend server.js otomatis

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-002

## Files Involved
- deploy.sh — setup_nginx() baca configs/site.webmail.custom (hapus heredoc hardcoded); tambah deploy_backend() sync server.js + src/lib + restart sogo-smtp-proxy dengan change-detection (md5) agar skip restart pada deploy frontend-only
- scripts/test-nginx-routes.mjs — verifikasi single-source + backend deploy + route image-proxy

## Next Steps
- (selesai) commit + push + deploy verifikasi idempotent

## Risks
- deploy.sh setup_nginx() dulu memelihara heredoc nginx TERPISAH dari configs/site.webmail.custom → drift bisa menimpa hardening saat deploy. Sudah disatukan.
- Restart sogo-smtp-proxy menjatuhkan sesi SMTP in-memory → mitigasi change-detection md5.

## Validation
- 15/15 test PASS (test:nginx-routes diperbarui) · bash -n deploy.sh OK · git diff --check OK
- Deploy idempotent diverifikasi: nginx single-source OK, backend "skip sync + restart" (hash match), webmail HTTP 200
