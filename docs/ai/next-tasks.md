# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T02:59:14Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: INCIDENT login massal 2026-08-18. Kantor timeout: MikroTik spam-blocklist (spam-detect.sh, cron */2mnt, threshold 5 SASL fail/5mnt)  CrowdSec ban false positive — resolved via unban  allowlist  whitelist prefix 115.178.128. Cabang Login ditolak = password user tidak cocok (bukan bug), plus brute force 16 Agu 9271 attempt. String lt0qcqr9 di log SOGo = SSO password internal, bukan password user. Backup spam-detect.sh.bak-20260818.
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
