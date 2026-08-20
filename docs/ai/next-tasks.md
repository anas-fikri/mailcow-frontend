# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:27:53Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: deploy mengirim beberapa ssh call tambahan ke server. Tidak restart
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Mock ssh di test adalah abstraksi; smoke test aktual sudah
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 17/17 test PASS (baru test:deploy-runtime-env, 5 skenario)
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: deploy.sh tambah helper ensure_runtime_env() yg idempotent utk key=value di server .env. Dipanggil di awal deploy_backend — bekerja walaupun server.js unchanged (no restart kalau tak ada code change). Pola ssh: awk utk baca nilai / printf+tambah utk append / sed+.bak+printf utk replace. EXPECTED_SMTP_SESSION_IDLE_MIN=60 di top of file (override via env). Test: scripts/test-deploy-runtime-env.sh — 5 skenario bash (mock ssh via tmp dir). 17/17 test PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 7 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
