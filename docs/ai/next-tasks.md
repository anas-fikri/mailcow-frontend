# Suggested Next Tasks

Project: mailcow-frontend
Generated At: 2026-08-26T10:43:06Z

Suggestions are evidence-based from current task state, goals, validation, risks, and repository state. Review before starting work.

## 1. [MEDIUM] Follow up on discovered knowledge: Rotasi OWASP (rate-limit + data leak antar role): (1) 429 harus masuk daftar no-retry react-query — retry 429 memperparah rate-limit server (hanya 401/403/404 yang dikecualikan sebelumnya). (2) queryClient.clear() wajib di SEMUA jalur logout: session-expired sudah benar, tapi logout manual (Sidebar) & login baru (LoginPage) hanya clearUser() → cache akun A (pesan/kontak/kalender/prefs) tersisa di memori saat akun B login di perangkat sama; query key memuat sogoToken jadi tak tampil, tapi hygiene memori buruk di shared device. (3) Backend sudah solid: rate-limit per-akun (send 10/mnt key session.user), ownership /api/preferences (403 bila email != sesi), from dipaksa session.user (anti-spoof), cookie SMTP HttpOnly+SameSite=Strict+Path=/api (CSRF tertutup via preflight JSON juga). 123 a11y assertions, 55/55 PASS.
- Why: Latest completed-task finding may imply documentation, validation, or follow-up work.
- Source: knowledge.md

## 2. [LOW] Review and commit current changes
- Why: 4 uncommitted file entries remain in the project.
- Source: git status

## Agent Use

Select one suggestion only after checking dependencies and user priority. Start it with:

ai-start "<selected task>"
