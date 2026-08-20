# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T13:31:36Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Browser throttling di background tab bisa menunda heartbeat visibility
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Resolve risk: Immediate ping saat resume: bila sesi sudah expired sebelumnya
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 3. [HIGH] Run or verify validation: 18/18 test PASS (baru test:smtp-heartbeat, 5 skenario)
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 4. [MEDIUM] Follow up on discovered knowledge: SmtpHeartbeat: ping /api/auth/smtp/status setiap 50 menit (SMTP_HEARTBEAT_INTERVAL_MS = 50*60*1000) HANYA saat document.visibilityState === 'visible'. Saat hidden → clearInterval. Resume→visible: immediate ping (catch-up). Helper pure setupSmtpHeartbeat({schedule, isVisible, setInterval, clearInterval}) - testable dgn mocked timers. Sidebar refetchInterval juga visibility-aware (return false saat hidden) supaya lastUsed TIDAK di-refresh via polling countdown. lastUsed di server di-refresh via requireSmtpSession middleware setiap call ke /api/send atau /api/auth/smtp/status. 401 dari ping → throwIfAuthError → App.jsx auto-logout (sama dgn /api/send).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 5. [LOW] Review and commit current changes
- Why: 11 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
