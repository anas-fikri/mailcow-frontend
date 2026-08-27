# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-27T03:41:48Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Batas lampiran webmail kini env-configurable: SMTP_MAX_ATTACHMENT_MB (default 20), SMTP_MAX_TOTAL_MB (60), SMTP_MAX_ATTACHMENTS (10) — server.js menghitung body limit express dari nilai tsb (jangan hardcode '30mb'). GET /api/send/config mengekspos batas ke frontend (ComposeModal fetch saat buka). Control-tower punya GET/POST /api/webmail/send-config yang menulis .env sogo-proxy + restart sogo-smtp-proxy via exec child — PENTING: systemctl --user dari proses node non-login butuh XDG_RUNTIME_DIR=/run/user/1000 eksplisit. Route /api baru wajib ditambah location exact di configs/site.webmail.custom (tanpa itu SPA fallback 200/405).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
