# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T03:51:24Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: ROOT CAUSE Sesi SOGo tidak terbentuk: sync_sogo_passwords.sh (cron */5mnt) unconditional flush_all memcached tiap 5 menit — sesi SOGo tersimpan di memcached, jadi semua user webmail ke-logout tiap ≤5 menit  race saat login (connect sukses -> flush -> warm-up 403). Fix: flush hanya jika ROW_COUNT>0 (ada password berubah). Terbukti: sebelum fix sesi hilang tepat setelah cron tick (03:30 nol sesi), setelah fix sesi bertahan 4+ tick (03:35-03:50). Backup sync_sogo_passwords.sh.bak-20260818. Bonus: x+failedlogins (throttle brute-force) tidak di-reset tiap 5 menit lagi.
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
