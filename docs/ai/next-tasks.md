# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-20T12:57:04Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [HIGH] Resolve risk: Idle 30 min — user yang cuma baca email tanpa ngirim >30 min akan ke-logout
- Why: Risk was recorded but not marked resolved.
- Source: current-task.md

## 2. [HIGH] Run or verify validation: 15/15 test PASS (baru: test:smtp-session-expired) · npm run build OK
- Why: Current task contains validation work that still needs explicit confirmation.
- Source: current-task.md

## 3. [MEDIUM] Follow up on discovered knowledge: sendMessage di src/lib/api.js sebelumnya melempar Error mentah pada 401 /api/send sehingga _onSessionExpired tidak terpanggil — user tetap logged-in tapi tidak bisa kirim email (SMTP proxy session sudah berakhir di server). Fix: kedua branch /api/send (path utama dgn lampiran + fallback setelah SOGo-501) sekarang memanggil throwIfAuthError(res) untuk 401, sehingga App.jsx logout paksa + navigate /login. 403 TIDAK logout (From-mismatch). TTL cookie + server tetap 8 jam (SESSION_MAX_AGE_MS=480min, Max-Age=28800); idle 30 min (SESSION_IDLE_MS env SMTP_SESSION_IDLE_MIN). Test: scripts/test-smtp-session-expired.mjs — memanggil callback=1 utk sendMessage 401 dgn lampiran, callback=0 utk registerSmtpSession 401 (saat login, _onSessionExpired null).
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 4. [LOW] Review and commit current changes
- Why: 8 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
