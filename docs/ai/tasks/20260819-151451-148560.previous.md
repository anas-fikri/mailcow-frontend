# Current Task

**Tanggal:** 2026-08-19

## Objektif aktif
Pindahkan `smtpToken` dari localStorage ke cookie httpOnly — menutup vektor XSS
pencurian token sesi SMTP (risiko terdokumentasi di knowledge.md sejak round
sebelumnya). Selesai, divalidasi, di-deploy.

## Ringkasan perubahan
- **Server (`server.js` + `src/lib/smtpCookie.js` baru):** `/api/auth/smtp` POST kini
  menyetel `Set-Cookie: smtp_session=…; HttpOnly; SameSite=Strict; Path=/api; Secure; Max-Age=TTL`
  dan mengembalikan `{ ok: true }` (bukan `{ token }`). DELETE menghapus sesi + clear cookie.
  `requireSmtpSession` / `/api/send` membaca token dari cookie → fallback header/body
  (kompatibilitas deploy bertahap).
- **Frontend:** `authStore` tidak lagi menyimpan `smtpToken`; `api.js`
  (`registerSmtpSession`/`revokeSmtpSession`/`sendMessage`/`fetchPreferences`/`logout`)
  tidak lagi mengirim/menerima token — cookie dikirim otomatis via `credentials: 'include'`.
- **Keamanan:** HttpOnly (anti XSS theft) + SameSite=Strict + X-Api-Key (anti CSRF).

## Status
- [x] Implementasi server + frontend + test
- [x] 26/26 test PASS + build OK
- [x] Deploy live (frontend + backend restart)
- [ ] (opsional) httpOnly cookie untuk sogoToken SOGo — di luar scope task ini
Status: COMPLETED
Updated At: 2026-08-19T15:06:15Z
