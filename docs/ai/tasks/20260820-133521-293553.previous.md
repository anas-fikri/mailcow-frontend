# Current Task

Status: COMPLETED
Task ID: 20260820-133121-262175
Started At: 2026-08-20T13:31:21Z
Updated At: 2026-08-20T13:31:36Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: heartbeat SMTP tiap 50 mnt hanya saat tab aktif (idle reset jadi true-tab-inactive)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — usability/UX)

## Files Involved
- src/lib/smtpHeartbeat.js — helper setupSmtpHeartbeat pure (testable)
- src/components/SmtpHeartbeat.jsx — wrapper React, panggil fetchSmtpSessionStatus
- src/components/layout/AppLayout.jsx — mount <SmtpHeartbeat /> setelah login
- src/components/layout/Sidebar.jsx — refetchInterval visibility-aware
- scripts/test-smtp-heartbeat.mjs — 5 skenario unit test

## Summary
idle timer server (SESSION_IDLE_MS=60m, sekarang via SMTP_SESSION_IDLE_MIN=60)
akan counting-down hanya bila tidak ada panggilan yg me-refresh lastUsed.
Sebelumnya Sidebar polling 60 pada setiap detik (60s) TANPA visibility check
→ lastUsed di-refresh terus walau tab inactive (idle tidak pernah trigger).

Sekarang:
- SmtpHeartbeat: ping /api/auth/smtp/status setiap 50 menit HANYA saat
  document.visibilityState === 'visible'. Saat hidden → clearInterval.
  Resume→visible: immediate ping (catch-up).
- Sidebar countdown poll juga visibility-aware (return false saat hidden)
  sehingga tidak me-refresh lastUsed melalui polling biasa.
- 401 dari ping → throwIfAuthError → App.jsx auto-logout (sama dgn /api/send).

## Risks
- Browser throttling di background tab bisa menunda heartbeat visibility
  callback, tapi karena kita eksplisit pause saat hidden, hal ini aman.
- Immediate ping saat resume: bila sesi sudah expired sebelumnya
  (user lunch >60m), user akan otomatis logout begitu kembali ke tab.
  Ini sesuai dengan intent user (idle kick in untuk tab truly inactive).

## Validation
- 18/18 test PASS (baru test:smtp-heartbeat, 5 skenario)
- npm run build OK
