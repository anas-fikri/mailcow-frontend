# Current Task

## Task: Audit keamanan nginx production webmail — CSP/HSTS/security headers

**Status: SELESAI (live)** → config di-apply + nginx -t + reload + verifikasi headers.

## Ringkasan
Audit `configs/site.webmail.custom` vs kebutuhan app. Gap ditemukan:
**HSTS, COOP, CORP, X-XSS-Protection, upgrade-insecure-requests semuanya
tidak ada** di produksi. Diperbaiki + divalidasi live.

## Gap sebelum / Sesudah

| Header | Sebelum | Sesudah |
|---|---|---|
| `Strict-Transport-Security` (HSTS) | ❌ tidak ada | ✅ `max-age=31536000` (tanpa includeSubDomains — subdomain lain belum tentu HTTPS) |
| `Cross-Origin-Opener-Policy` | ❌ | ✅ `same-origin` |
| `Cross-Origin-Resource-Policy` | ❌ | ✅ `same-origin` |
| `X-XSS-Protection` | ❌ | ✅ `0` (filter XSS legacy dinonaktifkan — konsisten dgn server.js) |
| CSP `upgrade-insecure-requests` | ❌ | ✅ |
| CSP `img-src` | `'self' data:` (dipertahankan) | `'self' data:` — **TANPA `https:`** (sengaja: semua gambar eksternal email di-rewrite ke /api/image-proxy; mengizinkan https: langsung membuka jalur tracking-pixel) |
| nosniff / XFO DENY / Referrer-Policy / Permissions-Policy | ✅ | ✅ (dipertahankan) |

## Detail
- Diterapkan ke 3 blok location (/webmail root, *.html, assets) — konsisten.
- `/api/*` proxy: tidak diubah — respon dari server.js sudah set header
  keamanannya sendiri (CSP, XFO, nosniff, dll); HSTS cukup dari halaman.
- Referrer-Policy `strict-origin-when-cross-origin` penting: URL SOGo memuat
  sogoToken di path — hanya origin yang dikirim saat navigasi keluar.
- Validasi: `nginx -t` OK di container → reload → headers live terverifikasi
  via curl. Webmail 200, health via key 200.
- **Non-regresi**: /api/image-proxy routing tetap jalan (test `not-a-url` →
  400 passthrough; 502 utk URL gambar gagal = status sengaja dari
  remoteImage.js utk fetch error — bukan regresi).

## Catatan operasional
- Config live = `configs/site.webmail.custom` (single source; deploy.sh
  substitusi port + copy + reload). Sudah di-apply manual + diverifikasi;
  deploy.sh berikutnya akan menerapkan ulang (idempotent).

Status: COMPLETED
Updated At: 2026-08-26T02:01:52Z
