# Current Task

## Status: SELESAI ✅

**Hardening error production: "Terjadi Kesalahan" di /webmail/mail + gagal fetch saat login**

Laporan user: sebagian user kena ErrorBoundary saat buka `/webmail/mail`, sebagian gagal fetch saat login. Infra luar dicek sehat (`.com`/`.co.id` → 202.148.2.139, HTTP 200, CSP `connect-src 'self'`, `/SOGo/connect` reachable, tanpa service worker). Root cause persis butuh `pcp_last_error` dari user (ditanyakan).

Hardening defensif diterapkan (terlepas root cause):

1. **Timeout fetch login/SMTP** — `fetchWithTimeout` (api.js) dengan AbortController:
   `connectSogo` 20s, `registerSmtpSession` 15s. AbortError → error jaringan ramah.
   Tanpa ini backend hang → tombol "Masuk" menggantung selamanya tanpa pesan.
2. **Pesan error login ramah** — `isNetworkError`/`friendlyLoginError` (loginDiagnostics.js):
   "Failed to fetch"/"NetworkError"/AbortError → pesan Indonesia jelas; HTTP error
   tetap pakai pesan spesifik. Dipakai LoginPage.
3. **Recover chunk load gagal** — `lazyWithReload` (App.jsx): setelah deploy
   (rsync --delete), chunk lama 404 → reload sekali (flag sessionStorage anti-loop)
   → ambil index.html + nama chunk baru. Error nyata tetap ke ErrorBoundary.

### Validasi
- test-login-diagnostics +16 (isNetworkError/friendlyLoginError)
- test-login-flow +7 statis (timeout connect/smtp, lazyWithReload, friendlyLoginError)
- **54/54 PASS** · build OK · deploy live terverifikasi hash

### Tindak lanjut
- Minta user `localStorage.getItem('pcp_last_error')` / teks error login persis
  untuk pinpoint root cause akun-spesifik.
