---
id: T-wj86
title: 'Webmail: verifikasi auto-load universal (Sent/Drafts/Junk/Trash)'
status: done
profile: standard
goal: G-001
created: "2026-08-20T12:53:33Z"
updated: "2026-08-20T12:53:40Z"
legacy:
  source: docs/ai/tasks/20260820-125654-156816.previous.md
  status: COMPLETED
  v1_id: 20260820-125333-305684
---

## Objective
Webmail: verifikasi auto-load universal (Sent/Drafts/Junk/Trash)

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-008 (mailbox usability)

## Files Involved
- src/pages/MailPage.jsx — komentar eksplisit: auto-load universal per folder
- scripts/test-message-api.mjs — fetchMessageHeaders loop 5 folder (INBOX/Sent/Junk/Drafts/Trash)

## Summary
Audit `selectedFolder === 'folderINBOX'` di MailPage: hanya 4 site, semua OK untuk universal auto-load:
  - new-mail notification (line 392) → INBOX saja
  - 5-bulan cutoff (line 591) → INBOX saja (penghemat memory untuk ribuan email)
  - snooze button (line 1227) → INBOX saja
  - footer copy (line 1854-1857) → beda copy INBOX vs folder lain
Tidak ada pengecualian di loadMore/sentinel/header-pill. Ditambah test eksplisit
utk fetchMessageHeaders lintas folder (assert URL + body POST).

## Risks
- Folder dengan ribuan email (Sent) akan auto-fetch semua header — bisa
  membebani server. Untuk sekarang sesuai pola native SOGo PRELOAD SIZE=100.
  Jika terbukti masalah di produksi, bisa ditambahkan pagination client-side
  lebih agresif atau pengingat "Anda melihat 5000 terbaru, cari via pencarian".

## Validation
- 14/14 test PASS · npm run build OK
