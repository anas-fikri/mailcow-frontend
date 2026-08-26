# Current Task — Audit OWASP refresh: rate-limit + data leak antar role

## Status
- **Backend (server.js) diverifikasi solid**: rate-limit per-route/per-akun
  (send 10/mnt/akun, prefs 30/mnt/IP, auth 5/mnt/IP, image-proxy 120/mnt/IP),
  X-Real-IP trusted-proxy, ownership /api/preferences (403 bila email ≠ sesi),
  from dipaksa session.user (anti-spoof), cookie SMTP SameSite=Strict+HttpOnly.
- **Fix 1**: react-query tidak lagi me-retry 429 (sebelumnya retry 2x → perparah).
- **Fix 2**: queryClient.clear() saat logout manual (Sidebar) + sebelum login baru
  (LoginPage) — cegah data sensitif akun A tersisa di memori saat akun B login.
- Test: test-a11y +3 → 123 assertions, 55/55 PASS, build OK.

## Next
- Commit + push + deploy + ai-close
