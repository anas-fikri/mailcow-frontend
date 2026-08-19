# Current Task

Status: COMPLETED
Task ID: 20260819-141730-202327
Started At: 2026-08-19T14:17:30Z
Updated At: 2026-08-19T14:17:46Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: deploy.sh verify() tambah health-check /api/image-proxy (SSRF guard + smoke test gambar eksternal)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-002

## Files Involved
- deploy.sh — verify() + verify_image_proxy(): cek route image-proxy (internal IP → 403) + smoke test gambar eksternal (200 image/*); tambah fungsi warn() + warna YELLOW (sebelumnya dipakai tanpa definisi); webmail_host() ambil host dari WEBMAIL_URL
- scripts/test-nginx-routes.mjs — verifikasi verify_image_proxy + warn() ada

## Next Steps
- (selesai) commit + push

## Risks
- Smoke test gambar eksternal bersifat non-fatal (warn) — tergantung koneksi keluar server; cek SSRF guard (403) tetap deterministik/fatal.

## Validation
- bash -n deploy.sh OK · test:nginx-routes PASS · deploy live: SSRF 403 + gambar eksternal 200 image/png
