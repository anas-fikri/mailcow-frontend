# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-09-07T07:05:47Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Deploy-reload latency fixed: 60s visible-tab poll + immediate check on visibilitychange/focus (30s throttle) in deployCheck.js; SW v8 stops caching unique ?bv= probe URLs (was ~1440 dead entries/day/tab at 60s polling), main.jsx registers sw.js?v=8. Regression contracts locked in test-deploy-check.mjs (interval 60_000, isDeployProbe, visibility behavior). Suite 87/87, live verified md5-identical on both hosts; pushed via SOCKS tunnel 1080 since gitlab.pcpexpress.com hangs from workspace (durable pattern).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"

## 3. [MEDIUM] Tambahkan informasi quick chat dashboard sebagai card di webmail (pending dependency)
- Why: Permintaan user (2026-09-07): informasi dari quick chat dashboard akan ditampilkan dalam bentuk card di webmail. **Blocked** sampai modifikasi quick chat dashboard selesai.
- Source: user request
