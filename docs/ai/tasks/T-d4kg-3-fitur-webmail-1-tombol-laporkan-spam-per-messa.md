---
id: T-d4kg
title: '3 fitur webmail: (1) tombol Laporkan Spam per-message (native SOGo), (2) fix lampiran tidak muncul, (3) buat/hapus subf…'
status: todo
profile: standard
created: "2026-08-19T09:00:00Z"
updated: "2026-08-19T10:30:00Z"
legacy:
  source: docs/ai/tasks/20260819-103030-365882.previous.md
  status: DEPLOYED (2026-08-19)
  v1_id: 20260819-090000-3fitur
---

## Objective
3 fitur webmail: (1) tombol Laporkan Spam per-message (native SOGo), (2) fix lampiran tidak muncul, (3) buat/hapus subfolder di sidebar. SELESAI + DEPLOYED.

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/lib/api.js — createFolder, deleteFolder, markMessagesAsJunk, markMessagesAsNotJunk, normalizeUids
- src/components/mailer/MessageReader.jsx — extract* fix (parts array), formatFileSize string, tombol spam + spamMutation
- src/pages/MailPage.jsx — junkMutation native, subfolder UI + folder dialog modal, keyboard '!' native

## Next Steps
- Verifikasi live manual (user skip otomatis): tombol spam, lampiran tampil, buat/hapus subfolder
- Kredensial test `anas.fikri@pcpexpress.co.id` stale (403 LDAPPasswordPolicyError 65535) — perlu kredensial segar utk verifikasi

## Risks
- Live verify belum dilakukan manual — verifikasi visual oleh user/QA disarankan

## Validation
- npm run build OK (285ms, VITE_API_KEY production)
- test:message-html / test:mailbox-tree / test:path-segment PASS
- Deploy: rsync dist → mailserver + nginx reload, HTTP 200 via 127.0.0.1 --resolve
- Commit 200b250 pushed ke GitLab main
