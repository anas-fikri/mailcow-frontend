# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-10-07T06:35:52Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Workspace bisa tertinggal dari GitLab karena deploy.sh pull/build dari clone ini (REMOTE_REPO_DIR sama dgn PROJECT_ROOT) lalu git reset --hard origin/main — commit unpushed hilang saat deploy berikutnya; selalu fetch dulu sebelum analisis. Hash chunk dist tidak comparable antar-build (VITE_API_KEY di-inject + build-version timestamp); verifikasi source via marker string di bundle.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 5 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
