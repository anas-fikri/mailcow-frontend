# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-19T15:06:16Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: smtpToken dipindah dari localStorage ke cookie httpOnly (smtp_session): HttpOnly+SameSite=Strict+Path=/api+Secure+Max-Age=TTL. server.js /api/auth/smtp POST kini Set-Cookie + return {ok:true}; DELETE clear cookie; requireSmtpSession//api/send baca cookie dengan fallback header/body (kompatibilitas deploy bertahap). Frontend: authStore hapus smtpToken state; api.js registerSmtpSession/revokeSmtpSession/sendMessage/fetchPreferences/logout tidak lagi pegang/kirim token (credentials:'include'). Helper murni src/lib/smtpCookie.js (parseCookies/build/clear) + test:smtp-cookie. CSRF dipertahankan via SameSite=Strict + X-Api-Key (custom header → preflight). Catatan: dev lokal http butuh COOKIE_SECURE=false bila server.js dijalankan manual. 26/26 test PASS + build OK.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 19 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
