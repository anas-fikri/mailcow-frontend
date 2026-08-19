# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T14:13:57Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] (selesai) commit + push + deploy verifikasi idempotent
- Why: Explicit next step recorded on active task.
- Source: current-task.md

## 2. [HIGH] Resolve risk: deploy.sh setup_nginx() dulu memelihara heredoc nginx TERPISAH dari configs/site.webmail.custom → drift bisa menimpa hardening saat deploy. Sudah disatukan.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Resolve risk: Restart sogo-smtp-proxy menjatuhkan sesi SMTP in-memory → mitigasi change-detection md5.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 4. [HIGH] Run or verify validation: 15/15 test PASS (test:nginx-routes diperbarui) · bash -n deploy.sh OK · git diff --check OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 5. [MEDIUM] Follow up on discovered knowledge: deploy.sh setup_nginx() dulu memelihara heredoc nginx TERPISAH dari configs/site.webmail.custom (dua sumber) — drift bisa menimpa hardening saat deploy. Kini single source + sed substitusi port. Backend server.js + modul import lokal TIDAK ikut ter-deploy oleh deploy.sh sebelumnya — harus di-sync manual; kini otomatis di deploy_backend() dengan hash-change guard.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
