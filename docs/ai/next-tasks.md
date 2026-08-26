# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T02:04:33Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: /api/health butuh API key — di-enforce di server.js app.use('/api', requireApiKey) SEBELUM route (bukan di nginx; nginx passthrough). Preflight deploy.sh cek dgn key ke backend langsung; verify() tidak cek health → gap. Fix: verify_health() end-to-end via nginx (--resolve 127.0.0.1) + key dari .env via awk heredoc (pola sama preflight, anti-escaping); harap 200. Keputusan: health tetap di belakang key (konsisten semua /api/*, hanya {ok:true}). CATATAN arsitektur: VITE_API_KEY ada di bundle frontend = soft gate; auth sebenarnya /api/send dll = cookie SMTP httpOnly SameSite=Strict; jangan andalkan API key sbg satu-satunya auth.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 6 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
