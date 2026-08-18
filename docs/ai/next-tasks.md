# Suggested Next Tasks

Project: sogo-frontend
Generated At: 2026-08-18T04:41:44Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Run or verify validation: `npm run build` ✅ 
- Why:  **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.|Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 2. [MEDIUM] Follow up on discovered knowledge: Control Tower mailboxes kosong: patch hapus gate /api/v1 (18 Agu) ikut menghapus location ^~ /api/v1/ FastCGI  inject X-API-Key server-side — SPA Control Tower dapat body kosong dari json_api tanpa key. Fix: restore block FastCGI  HTTP_X_API_KEY (tanpa gate auth_request yang membunuh UI Mailcow). Verifikasi: mailbox/all 919KB, domain/all 4.5KB, passwordpolicy/html 200, UI Mailcow POST / Login failed normal. Pelajaran: jangan hapus inject X-API-Key di site.control-tower.custom; gate auth_request JANGAN dipasang lagi. Catatan keamanan: /api/v1/* efektif publik (status quo pra-11 Agu).
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
