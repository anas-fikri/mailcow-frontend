# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-19T09:45:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Deploy 3 fitur baru (spam native, fix lampiran, subfolder) + verifikasi live
- Why: Implementasi selesai + build OK, tapi belum deploy. Live verify terblokir karena kredensial test stale (403 LDAPPasswordPolicyError) — butuh kredensial segar utk konfirmasi response SOGo aktual (struktur parts array, size string, endpoint junk/subfolder).
- Source: current-task.md, handoff.md

## 2. [MEDIUM] Verifikasi live response SOGo aktual dgn kredensial test segar
- Why: Implementasi defensive mengikuti ground truth source (deployed == master checksum), tapi konfirmasi runtime belum ada: `msg.parts` array?, `size` string?, endpoint markMessagesAsJunk 204?, createFolder/deleteFolder sukses?
- Source: handoff.md

## 3. [LOW] Review dan commit perubahan docs + kode
- Why: 8 file belum di-commit (api.js, MessageReader.jsx, MailPage.jsx + 5 docs).
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
