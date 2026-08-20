# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:35:46Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: SSH key required di host yg menjalankan cron — perlu setup satu kali
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Log 401 send mengandung IP bukan email/timestamp — minim PII
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 18/18 test PASS
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: scripts/monitor-smtp.sh: probe /api/health (via SSH) + hitung rasio [smtp-session] 401 send / Registered for dlm journalctl window. Exit 0 OK, 1 unhealthy, 2 ratio > CRIT. JSON output utk alerting. Server.js tambah log '401 send: sesi tidak valid (ip=X)' di /api/send 401 — penting krn sebelumnya log tdk punya pola 401 capture. Cron: '*/15 * * * * ./scripts/monitor-smtp.sh --json > /var/log/smtp-monitor.json 2>&1'. Naikkan idle jika ratio > 0.20: EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh + restart sogo-smtp-proxy (deploy.sh ensure_runtime_env idempotent).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
