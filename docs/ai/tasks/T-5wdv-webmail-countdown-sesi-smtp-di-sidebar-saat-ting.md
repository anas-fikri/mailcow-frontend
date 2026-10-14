---
id: T-5wdv
title: 'Webmail: countdown sesi SMTP di Sidebar saat tinggal <15 menit'
status: done
profile: standard
goal: G-001
created: "2026-08-20T13:14:28Z"
updated: "2026-08-20T13:14:38Z"
legacy:
  source: docs/ai/tasks/20260820-131813-225244.previous.md
  status: COMPLETED
  v1_id: 20260820-131428-282178
---

## Objective
Webmail: countdown sesi SMTP di Sidebar saat tinggal <15 menit

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001 (webmail — usability)

## Files Involved
- server.js — GET /api/auth/smtp/status (rate-limit 30/min, return remainingMs)
- src/lib/api.js — fetchSmtpSessionStatus()
- src/lib/sessionCountdown.js — formatRemaining + sessionWarningLevel + SHOW_BELOW_MINUTES
- src/components/layout/Sidebar.jsx — poll 60s + tick 1s + badge tipis
- scripts/test-session-countdown.mjs — test pure helper

## Summary
User ingin tahu kapan harus refresh/login sebelum sesi SMTP berakhir otomatis.
Workflow:
- Poll GET /api/auth/smtp/status tiap 60s (rate-limit server 30/menit cukup)
- Server mengembalikan `{user, createdAt, lastUsed, maxAgeMs, idleMs, remainingMs}`
  (remainingMs = min(maxAgeAbs-remaining, idle-remaining))
- Client tick remainingMs ke bawah tiap detik (no extra RTT)
- Tampil badge "SMTP 14:32" di Sidebar saat < 15 menit; warna amber saat < 5 menit;
  destructive + animate-pulse saat < 1 menit
- 401 dari status memicu throwIfAuthError → auto-logout, sama seperti /api/send

## Risks
- Tick mengandalkan Date.now() lokal — jam klien meleset bisa bikin count tidak
  akurat, tapi server tick pada 401 akan trigger logout bila sudah berakhir.
- Polling 60s saat user idle masih hit server; rate-limit 30/menit masih aman.

## Validation
- 16/16 test PASS · npm run build OK
