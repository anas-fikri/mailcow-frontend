# 2026-09-30 — Fitur ganti password mailbox LIVE
- Keluhan: Preferences → Ganti Password → "Fitur ganti password tidak tersedia di server ini".
- Root cause: nginx route `/SOGo/so/*/Preferences/changePassword` → sogo-proxy, tapi endpoint
  tidak pernah ada di server.js (SOGo sendiri 404 walau SOGoPasswordChangeEnabled=YES).
- Fix: POST /api/preferences (intent=password) di server.js — verifikasi pwd lama via SMTP auth,
  hash {BLF-CRYPT} via doveadm pw, UPDATE mailbox, refresh sesi, flush cache auth Dovecot.
  Frontend changePassword di api.js dialihkan ke endpoint ini. Tanpa ubah nginx.
- Test: 77 + 21 + nginx-routes + send-auth-order PASS.

# 2026-09-30 — Re-deploy via deploy.sh: semua surface sinkron
- `./deploy.sh` sukses: server clone fetch 0935c72→8aec839, build Node v22.22.2, rsync, nginx reload.
- Production build baru `1790760574325-p6f0p1`; verifikasi: webmail 200, /api/health 200 (via API key), image-proxy SSRF guard OK.
- Workspace = GitLab = server clone = production, semua `8aec839`. Deploy.sh tetap satu-satunya jalur deploy.

# 2026-09-30 — Audit sync workspace/GitLab/production
- Workspace kettinggalan 3 commit TDZ-followup (9abb2fc, 5cc8dd2, 8aec839) dari Abdul Latif — sudah di-pull, main = origin/main = 8aec839.
- Production live di 8aec839 (build `1790216486631-v9t0nv`): fix `fetchSmtpSessionStatus` 401-only terverifikasi di bundle (`==401&&Z(e)`).
- Catatan: Abdul Latif deploy sendiri dari luar deploy.sh — clone server masih 0935c72 (fetch gagal 401, butuh token). `/api/health` 403 via public URL (API key required) — bukan error.

# Sesi sebelumnya
- Deploy dari GitLab ke production: berhasil 100%
- Semua validasi pass: build ✅, deploy ✅, test suites (70+) ✅, webmail ✅

## Yang selesai
1. **TDZ fix** — `ReferenceError: Cannot access 'q' before initialization` di MailPage
   - Akar: `const flagColorOf = (uid, folder = selectedFolder)` → `selectedFolder` belum di-`useState` karena deklarasi dibalik
   - Fix: pindah `const [selectedFolder, setSelectedFolder]` ke atas helper
   - Build version terbaru: `1790213975424-65z19l`

2. **Deploy.sh hardening** (5 fix)
   - `GITLAB_USER` auto-detect dari Keychain → token cocok dengan email user (`anas.fikri@pcpexpress.com`)
   - `GIT_ASKPASS` → `credential.helper inline` (pola konsisten dgn local push)
   - `npm ci` full (tanpa `--omit=dev`) — vite di devDependencies
   - `PUPPETEER_SKIP_DOWNLOAD=true` — server gak punya Chrome
   - `nvm use 22` — Node 18 system, Vite 6 butuh Node 22+

## Status
- Workspace = GitLab = Production (all 0935c72 → 5b15c7f merge history)
- `deploy.sh` adalah single source of truth deploy
- `token di Keychain` — masih valid untuk git ops, tapi 401 di GitLab API (bukan PAT scope — masih OK karena deploy cuma pakai git clone/fetch)

## Issue terbuka
- **`site.webmail.custom` nginx config** — rsync di heredoc `cp -f configs/site.webmail.custom "$NGINX_DIR/$NGINX_FILE"` tapi deploy.sh line 113 pakai `sed` untuk port substitution. Inkon sisten: heredoc cp langsung tanpa substitusi. Harusnya konsisten.

## Next
- Fix nginx config substitution di heredoc
- Cari priority user selanjutnya
## 2026-09-24T01:49:22Z
- Status: COMPLETED
- Objective: No objective recorded.
- Summary: Fix TDZ MailPage (Cannot access 'q' before initialization) + deploy.sh hardening: GITLAB_USER auto-detect, npm ci full, PUPPETEER_SKIP_DOWNLOAD, nvm Node 22. Deploy dari GitLab sukses — webmail live, error page gone.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
