---
id: T-nqgx
title: 'Webmail: auto-load kotak masuk saat scroll (server-side /headers, lewati batas 100)'
status: done
profile: standard
goal: G-001
created: "2026-08-20T11:44:11Z"
updated: "2026-08-20T11:44:30Z"
legacy:
  source: docs/ai/tasks/20260820-125059-377940.previous.md
  status: COMPLETED
  v1_id: 20260820-114411-136241
---

## Objective
Webmail: auto-load kotak masuk saat scroll (server-side /headers, lewati batas 100)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-008 (mailbox usability)

## Files Involved
- src/lib/api.js — fetchMessages return `uids` + `fetchMessageHeaders()` baru (POST /headers)
- src/pages/MailPage.jsx — auto-load saat scroll (IntersectionObserver + sentinel), merge header /headers
- scripts/test-message-api.mjs — assert uids + fetchMessageHeaders + body { uids }

## Summary
Kotak masuk sebelumnya hanya menampilkan ~100 email (headersPrefetchMaxSize SOGo).
Sekarang fetch daftar UID lengkap dari /view, lalu muat header sisanya bertahap via
POST /headers saat sentinel bawah terlihat (pola native SOGo `$loadMessage`). Batas
5 bulan (MESSAGE_WINDOW_MONTHS) tetap dipertahankan: berhenti fetch begitu batch
menyentuh pesan lebih lama dari cutoff; sisanya via pencarian.

## Risks
- /headers membalas baris dalam urutan IMAP (bukan urutan request) → merge di-sort
  ulang descending by uid agar visibleCount.slice(0,n) reveal berurutan.

## Validation
- 14/14 test PASS · npm run build OK
