# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:18:23Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Memory map smtpSessions di server: dengan idle 60m, lebih banyak sesi bisa
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Restart menjatuhkan sesi in-memory → semua user harus login ulang
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 16/16 test PASS (frontend, tidak ada perubahan kode)
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Idle timeout SMTP proxy dapat diatur via env SMTP_SESSION_IDLE_MIN (default 30 menit di server.js). Dipakai runtime via EnvironmentFile=%h/sogo-proxy/.env — BUKAN inline Environment= di .service unit yang ada di server (yang sebenarnya hanya berisi WorkingDirectory/ExecStart/Restart/EnvironmentFile). Untuk mengubah runtime value, edit .env di server, lalu systemctl --user restart sogo-smtp-proxy. TTL absolut terpisah (SMTP_SESSION_TTL_MIN=480=8jam) jadi 'tetap aman'. Memory map dibatasi SESSION_MAX_PER_USER=10 (LRU eviction). Idle 60 menit menambah window risiko hijack ~30 menit, masih wajar & industri-bandingkan.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 6 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
