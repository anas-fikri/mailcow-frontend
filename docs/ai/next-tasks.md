# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T04:32:10Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Dashboard migration portal kosong: ada DUA proyek — imapsync-migrate (ASLI, 522 job/520 token, auth doveadm helper via admin-auth-check.sh, env MAILCOW_API_KEY dkk) vs migration-portal (salinan tua bcryptjs 1 job). Saya restart proyek salah (migration-portal) sehingga dashboard tampil kosong. Fix: kill proses migration-portal, start imapsync-migrate (pid 670022) dengan source .env.server. Verifikasi: stats 522/408/114, health 200, helper HASH anas.fikri OK. TODO user sudo: unit systemd migration-portal.service harus menunjuk imapsync-migrate (sempat diarahkan ke migration-portal 04:26).
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
