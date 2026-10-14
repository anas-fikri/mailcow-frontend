---
status: accepted
date: 2026-08-17
---

# /api/* 401 ≠ SOGo session expiry + persist smtpToken

- **Decision:** 401/403 dari `/api/*` (proxy SMTP: `/api/preferences`, `/api/send`, `/api/auth/smtp`) TIDAK boleh memicu `_onSessionExpired` (force logout webmail). `fetchPreferences` kini fallback ke localStorage saat token SMTP tidak valid.
- **Reason:** Sesi SMTP proxy terpisah dari sesi SOGo. 401 di `/api/*` = token SMTP hilang/expired (reload halaman, idle 30 menit, restart proxy) — bukan sesi SOGo mati. Memicu logout paksa dari 401 SMTP membuat reload = logout + mailbox kosong + login berulang.
- **Decision:** `smtpToken` (UUID dari `/api/auth/smtp`) kini di-persist di localStorage (authStore partialize); sebelumnya memory-only.
- **Reason:** SOGo `/send` mengembalikan 501 → `/api/send` (butuh smtpToken) adalah jalur kirim yang bekerja; tanpa persist, reload mematikan kirim email + preferences DB. Token tidak berisi password, berumur pendek (8 jam / 30 menit idle), dan dicabut otomatis saat logout / proxy restart. Kredensial SMTP (user+pass) tetap TIDAK pernah dipersist.
- **Tradeoff:** Token di localStorage dapat dicuri oleh XSS (untuk kirim email via `/api/send`). Diterima karena berumur pendek, sesi SOGo cookie sudah memberi akses webmail yang setara, dan manfaat fungsional (reload tidak memutus sesi) lebih besar.
- **Catatan operasional:** Proxy 3005 sempat di-restart berulang via `nohup` manual (beberapa proses `node server.js` orphan terlihat di `ps`, satu bahkan di port default 3001) — setiap restart menghapus semua `smtpSessions` in-memory. Konsolidasi proses proxy direkomendasikan terpisah.

