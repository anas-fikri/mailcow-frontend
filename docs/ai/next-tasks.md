# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:06:04Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: verify_health ditambahkan ke deploy.sh verify() — cek /api/health end-to-end via nginx + API key (sebelumnya hanya preflight backend langsung). /api/health di-enforce requireApiKey di server.js (app level), nginx passthrough; konsisten dgn preflight. Deploy terverifikasi live: webmail 200, image-proxy 200, health 200.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
