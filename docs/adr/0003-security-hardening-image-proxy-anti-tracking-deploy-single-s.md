---
status: accepted
date: 2026-08-19
---

# Security hardening: image-proxy anti-tracking + deploy single-source

- **Decision (anti tracking-pixel):** Gambar eksternal pada email yang di-render di-rewrite ke `GET /api/image-proxy` (server-side fetch), pola Gmail — IP user tidak bocor ke pengirim. Backend `server.js` guard-nya SSRF-safe (`src/lib/ssrfGuard.js`: blokir IP privat/reserved, DNS-pin, redirect re-validate, image-only, 5MB/10s cap, rate-limit) dan route ditaruh SEBELUM `requireApiKey` karena `<img>` tidak bisa kirim header.
- **Decision (CSP fail-closed):** `img-src` diketatkan ke `'self' data:` (hapus `https:`). Gambar eksternal yang lolos dari rewrite justru TIDAK tampil (diblokir CSP) — vektor `srcset`/`<picture>`/CSS `background-image` yang belum di-rewrite ikut gagal aman, bukan bocor IP.
- **Decision (rewrite render-only):** `proxyExternalImages` dipakai HANYA di `displayHtml`; quote balasan/forward & compose tetap URL asli (dikirim sebagai email, harus valid untuk penerima).
- **Decision (deploy single-source):** `deploy.sh setup_nginx()` kini membaca `configs/site.webmail.custom` langsung (substitusi port via sed) — hapus heredoc nginx terpisah yang sempat drift dan berisiko menimpa hardening. `deploy_backend()` men-sync `server.js` + `src/lib/{ssrfGuard,emailValidation}.js` + restart `sogo-smtp-proxy`, dengan change-detection md5 agar deploy frontend-only tidak menjatuhkan sesi SMTP in-memory.
- **Decision (header injection):** Validasi email/recipient (`src/lib/emailValidation.js`) menolak SEMUA karakter kontrol (0x00–0x1F + DEL), bukan hanya CRLF — mencegah lone-`\n`/`\0` injection di header SMTP.
- **Decision (info disclosure):** ErrorBoundary kembali menyembunyikan `error.message` + `componentStack` di production (regresi dari fix Round 3); detail hanya ke console/localStorage.

