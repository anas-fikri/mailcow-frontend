# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:14:38Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Tick mengandalkan Date.now() lokal — jam klien meleset bisa bikin count tidak
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Polling 60s saat user idle masih hit server; rate-limit 30/menit masih aman.
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 16/16 test PASS · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: Server endpoint baru GET /api/auth/smtp/status dengan rate-limit 30/menit mengembalikan {user, createdAt, lastUsed, maxAgeMs, idleMs, remainingMs} dimana remainingMs = min(SESSION_MAX_AGE_MS - (now - createdAt), SESSION_IDLE_MS - (now - lastUsed)). requireSmtpSession middleware dipakaI jadi 401 = sesi berakhir otomatis picu logout via throwIfAuthError di fetchSmtpSessionStatus(). Client Sidebar poll tiap 60s + tick lokal 1s; tampil badge 'SMTP MM:SS' saat < 15 menit (show below SHOW_BELOW_MINUTES=15). Palette: muted ≤15m, amber ≤5m, destructive+animate-pulse ≤1m. Helper pure di src/lib/sessionCountdown.js: formatRemaining(ms) → 'M:SS' atau 'H:MM:SS', sessionWarningLevel(ms) → 'ok'
- Why: 'warn'|'urgent'. Test test:session-countdown.|Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 11 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
