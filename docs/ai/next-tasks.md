# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T03:57:14Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Migration portal login selalu ditolak walau password benar: proses restart nohup tanpa memuat .env.server -> DBPASS kosong -> mysql -p"" prompt interaktif -> Access denied -> verifyAdminPassword false. Fix: tambah DBUSER/DBPASS/DBNAME ke .env.server dari mailcow.conf  chmod x start.sh  restart via nohup bash start.sh. Unit systemd migration-portal.service salah path (imapsync-migrate) crash-loop 545x — perlu sudo utk perbaiki (TODO). Login portal = username bare bukan email. Backup .env.server.bak-20260818-2.
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
