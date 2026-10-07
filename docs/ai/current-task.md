# Active Task

## 2026-10-07 — Audit kesesuaian repo ↔ workspace ↔ development (source terbaru)

Status: COMPLETED
- Workspace kettinggalan 12 commit dari GitLab → pull ff-only ke `faacbd6` (main = origin/main).
- node_modules ↔ lockfile konsisten; build vite PASS; 64/64 suite test:* PASS.
- Production live (`1790766508154-7vr7i5`) = source `2f5fb59` — marker fitur ganti password
  terverifikasi di bundle live; beda hash chunk = injeksi VITE_API_KEY, bukan drift source.
- Fix `.ai-toolkit/project.env`: source of truth kini GitLab (komentar lama "Macbook" usang).
- Commit docs lokal menunggu keputusan push (deploy.sh `reset --hard` = unpushed rawan hilang).

## Sesi sebelumnya

## Goal
Fix `Cannot access 'q' before initialization` di production webmail.

## Root Cause
TDZ (Temporal Dead Zone): `flagColorOf`/`setFlagColorOf` helper menggunakan default parameter `folder = selectedFolder` SEBELUM `const [selectedFolder, setSelectedFolder] = useState('folderINBOX');` dideklarasikan. Vite/Rolldown me-minifikasi `selectedFolder` menjadi `q`, memicu `ReferenceError: Cannot access 'q' before initialization`.

## Done
- [x] Fix TDZ MailPage: move `selectedFolder` useState BEFORE `flagColorOf` + `setFlagColorOf`
- [x] Fix deploy.sh: auto-detect `GITLAB_USER` dari Keychain (token terikat ke `anas.fikri@pcpexpress.com`)
- [x] Fix deploy.sh: `npm ci` full (tanpa `--omit=dev`) + `PUPPETEER_SKIP_DOWNLOAD=true`
- [x] Fix deploy.sh: `nvm use 22` di remote (Vite 6 / Rolldown require Node 22+)
- [x] Build + push to GitLab (`0935c72`)
- [x] Full deploy to production via `./deploy.sh`
- [x] Validasi production: HTTP 200, build-version `1790213975424-65z19l`, `/api/health` 200, `/api/image-proxy` 403, error page GONE
- [x] Validasi test suites: 10+ suite test unit/integration PASS
- [x] Update AI docs (`knowledge.md`, `handoff.md`)

## Next
- Fix minor inconsistency: `site.webmail.custom` nginx config (sed substitution vs cp)
- Priority features selanjutnya dari user feedback
Status: COMPLETED
Updated At: 2026-10-07T06:35:52Z
