# Current Task

Status: COMPLETED (siap deploy)
Task ID: 20260819-090000-3fitur
Started At: 2026-08-19T09:00:00Z
Updated At: 2026-08-19T09:45:00Z
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## Objective
3 fitur webmail: (1) tombol Laporkan Spam per-message (native SOGo), (2) fix lampiran tidak muncul, (3) buat/hapus subfolder di sidebar.

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/lib/api.js — createFolder, deleteFolder, markMessagesAsJunk, markMessagesAsNotJunk, normalizeUids
- src/components/mailer/MessageReader.jsx — extract* fix (parts array), formatFileSize string, tombol spam + spamMutation
- src/pages/MailPage.jsx — junkMutation native, subfolder UI + folder dialog modal, keyboard '!' native

## Next Steps
- Deploy via ./deploy.sh (butuh VITE_API_KEY dari mailserver + SMTP proxy 3005 health check)
- Verifikasi live: tombol spam, lampiran tampil, buat/hapus subfolder

## Risks
- Live verify terblokir (kredensial stale 403 LDAPPasswordPolicyError) — implementasi defensive per ground truth SOGo source (deployed bundle == master checksum)

## Validation
- npm run build OK (844ms)
- test:message-html / test:mailbox-tree / test:path-segment PASS
