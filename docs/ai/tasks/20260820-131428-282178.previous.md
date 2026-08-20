# Current Task

Status: COMPLETED
Task ID: 20260820-125654-156816
Started At: 2026-08-20T12:56:54Z
Updated At: 2026-08-20T12:57:04Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: auto-logout saat sesi SMTP proxy berakhir; TTL 8 jam dipertahankan

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — hardening)

## Files Involved
- src/lib/api.js — sendMessage: 401 dari /api/send → throwIfAuthError → callback
- scripts/test-smtp-session-expired.mjs — baru: verifikasi auto-logout & no-logout saat login

## Summary
**Akar masalah:** "Sesi SMTP sudah berakhir. Silakan login ulang." tampil tapi user
TIDAK auto-logout. Penyebab: sendMessage melempar Error mentah (tanpa melalui
throwApiError/throwIfAuthError), jadi _onSessionExpired tidak terpanggil. Hasilnya
user tetap "logged in" tapi tidak bisa kirim email — UX membingungkan.

**Fix:**
- sendMessage: 401 dari /api/send (kedua branch: lampiran & fallback SOGo-501)
  → throwIfAuthError → picu _onSessionExpired → App.jsx logout paksa + toast
  "Sesi berakhir. Silakan login ulang." + navigate /login. 403 TIDAK logout
  (dipakai server untuk From address mismatch, bukan sesi).

**TTL dipertahankan (sudah memenuhi "8 jam tapi tetap aman"):**
- server.js SESSION_MAX_AGE_MS = 480 min = 8 jam (env SMTP_SESSION_TTL_MIN)
- smtpCookie.js Max-Age default = 28800 = 8 jam
- Idle timeout = 30 min (env SMTP_SESSION_IDLE_MIN) — pengaman tambahan agar
  sesi yang tidak dipakai tidak menggantung terlalu lama
- HttpOnly + SameSite=Strict + Secure + Path=/api (cookie hardening)
- 5 register/min rate-limit pada /api/auth/smtp

## Risks
- Idle 30 min — user yang cuma baca email tanpa ngirim >30 min akan ke-logout
  saat ngirim. Bisa diperpanjang via SMTP_SESSION_IDLE_MIN, default sengaja 30
  untuk "tetap aman" sesuai alasan user.

## Validation
- 15/15 test PASS (baru: test:smtp-session-expired) · npm run build OK
