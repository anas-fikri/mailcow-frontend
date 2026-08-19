# Current Task

Status: DEPLOYED (2026-08-19)
Task ID: 20260819-090000-3fitur
Started At: 2026-08-19T09:00:00Z
Updated At: 2026-08-19T10:30:00Z
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

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