# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-19T17:05:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Verifikasi live response SOGo aktual dgn kredensial test segar
- Why: 3 fitur sudah DEPLOYED (commit 200b250, HTTP 200 via deploy.sh), tapi konfirmasi runtime belum ada: `msg.parts` array?, `size` string?, endpoint markMessagesAsJunk 204?, createFolder/deleteFolder sukses? Kredensial `anas.fikri@pcpexpress.co.id` stale (403 LDAPPasswordPolicyError 65535).
- Source: current-task.md, handoff.md, knowledge.md

## 2. [LOW] Verifikasi visual manual webmail production
- Why: Deploy sukses (rsync + nginx reload, HTTP 200), tapi tidak ada login test. Cek tombol Laporkan Spam, lampiran tampil, buat/hapus subfolder via browser.
- Source: current-task.md

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"