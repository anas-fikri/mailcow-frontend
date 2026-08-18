# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T03:15:00Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Root cause admin Mailcow ga bisa login: gate auth_request di site.control-tower.custom (location ^~ /api/v1/) sejak 11 Agu blokir semua API Mailcow. Fix: hapus gate, nginx -t  reload, /api/v1/* balik ke Mailcow json_api. Login UI Mailcow = POST / (login_user/pass_user), bukan /api/v1/login (404 normal). Password admin tdk match AdminMail2026! (docs outdated). Backup: site.control-tower.custom.bak-20260818.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 3. [MEDIUM] Advance goal: Sub-goal G-001.S-002 — Documentation currency
- Why: Goal remains ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized..
- Source: goals.md

## 4. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
