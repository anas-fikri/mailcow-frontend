# Current Task

## Task: ai-loop security & data (OWASP refresh) — validasi input, rate-limit, data leak

**Status: SELESAI (48/48 test PASS, live)** → commit + push + deploy.

## Ringkasan
Audit keamanan sudut baru: rate-limit per-route/per-key, binding user antar
role, validasi input client (pathSegment, attachment, URL, search). 2 temuan
diperbaiki; sisanya diverifikasi sudah kuat.

## Temuan & Perbaikan

### Fix 1 — Rate-limit /api/send per-IP → self-DoS kantor/NAT
`/api/send` di-rate-limit per **IP** (clientIp). Kantor berbagi satu IP
publik → **10 kirim/menit total untuk semua user** (429 palsu / self-DoS).
**Fix:** middleware `resolveSmtpSession` (isi `req.smtpSession` tanpa menolak)
+ key bucket = `req.smtpSession?.user || clientIp(req)`:
- Sesi sah → bucket per AKUN (10/menit/user — tidak tersedot antar user)
- Tanpa sesi sah → fallback per-IP (bot tetap dibatasi)
- Handler reuse `req.smtpSession` (tanpa lookup ganda); telemetry
  `[smtp-session] 401 send` dipertahankan (monitor-smtp.sh grep pola ini)

### Fix 2 — Query pencarian tanpa batas panjang
`searchMessages` menerima query berapa pun → body raksasa ke SOGo.
**Fix:** `MAX_SEARCH_QUERY_LENGTH = 500` di `buildMessageSearchBody`
(truncate defensif) + `maxLength={300}` di input pencarian MailPage.

## Diverifikasi aman (tidak diubah)
- **Rate-limit lengkap**: semua 6 route /api/* punya limit per-route (bukan 1
  bucket bersama); `clientIp` hanya percaya X-Real-IP dari proxy terpercaya
  (loopback / 172.16/12 / TRUSTED_PROXY_IPS)
- **Data leak antar role**: `/api/preferences` cek `query.email` == session.user
  (403); `/api/send` From terikat session.user (403 spoof); status/health
  hanya data sendiri; error handler 500 generik (tanpa stack/path)
- **Validasi input**: pathSegment tolak traversal/percent-escape selain %2F
  folder; attachment filename tolak path/CRLF/control; `toSafeUrl` allowlist
  http/https/mailto/tel; Zod caps semua field send
- **Headers**: X-Frame-Options DENY, CSP ketat, nosniff, Referrer-Policy,
  Permissions-Policy; image-proxy sandbox CSP + anti-hotlink + SSRF guard
- **Auth**: requireApiKey timing-safe; SMTP cookie httpOnly SameSite=Strict

## Test
- **Baru `test:security-hardening`** (16 assertions): per-akun rate-limit key +
  resolveSmtpSession + telemetry 401; truncate search 500 (query 5000 → 500,
  null → '', criteria tetap); maxLength input; anti-regresi pathSegment
  traversal/nested, attachment filename, binding preferences.
- **48/48 test PASS** · `npm run build` OK · deploy sync backend (server.js)

Status: COMPLETED
Updated At: 2026-08-26T01:49:00Z
