# Active Task

## 2026-10-11 — Webmail ala Outlook desktop (branch worktree-outlook-ux, BELUM deploy)

Status: READY FOR REVIEW/UAT — 9 commit di branch `worktree-outlook-ux` (`0c3839d`..`ec4ba11`),
build PASS, 76/76 suite test PASS, smoke runtime Puppeteer 12/12 OK (mock SOGo fixture).

**Lingkup (review 4-agent lalu implementasi paralel):**
- Daftar pesan: Ctrl/Shift+klik multi-select, klik kanan (menu konteks + submenu),
  drag-drop pesan ke folder, MoveToPicker (cari folder), keyboard penuh ala Outlook
  (panah buka pesan, Del, Ctrl+Q/U/R/Shift+R/F/A/E/N/Z, Ctrl+Shift+V/G), optimistic
  update + undo 6 dtk (baris langsung hilang, Ctrl+Z), favorit folder, panel baca
  kanan/bawah/nonaktif + lebar pane persist, density normal/ringkas.
- Reader: Balas Semua (heuristik), prev/next + "x dari N", tandai-dibaca
  segera/tunda-N-dtk/manual (preferensi), lipat kutipan, Tampilkan header (viewsource),
  zoom A−/A+, forward bawa lampiran, konfirmasi hapus permanen di Trash.
- Compose: Esc/Ctrl+Enter, minimize ke bar bawah (baca email sambil compose), chip
  penerima tervalidasi + dedupe + saran panah, pengingat lampiran, beforeunload guard,
  undo-send mengembalikan pesan ke compose, toolbar lengkap, jadwal pakai waktu lokal.
- Shell/prefs: tab "Tata Letak & Baca" (default), menu akun di sidebar, BottomNav 5
  item + "Lainnya", switch role=switch, kontras dark diperbaiki, suara notifikasi.
- Backend: /api/send kini memasang In-Reply-To/References (threading balasan) —
  `src/lib/threadingHeaders.js` masuk BACKEND_LIB_FILES deploy.sh.

**Next:** UAT user di browser → merge ke main → `./deploy.sh` (frontend + backend
server.js + src/lib). Branch sudah di-push ke GitLab.

## Sesi sebelumnya

## 2026-10-08 — Fix "email terkirim masuk Trash, Sent kosong" (round-59: sent-copy)

Status: COMPLETED
- **Akar masalah (kasus bayu.gunawan@pcpexpress.com):** tidak ada satu pun jalur kirim
  webmail yang membuat salinan Sent (SMTP proxy tidak APPEND; fallback SOGo 501 juga
  tidak), sisa draft (`\Draft`) yang di-move user ke Trash terbaca sbg "email terkirim",
  plus 1 entry queue (`8b4baf71`) tidak pernah flush — persist melempar error (path
  `${__dirname}data/` tanpa `/`) yang meracuni loop flush.
- **Fix:** `src/lib/sentCopy.js` (buildSentRaw + appendSentCopy, DI penuh) di-wire ke
  kedua jalur kirim di server.js (best-effort, tidak menggagalkan pengiriman);
  sendQueue in-memory + save terserialisasi + persist tak melempar; dep `imapflow`.
- **Perbaikan lanjutan hasil E2E live:** imapflow class = named export; `append(path,
  content, flags, idate)` flags positional (bukan objek); deploy.sh kini jalan dari
  workspace Linux (token fallback `git credential fill` + GITLAB_USER autodetect).
- **Validasi:** suite 65/65 PASS, build OK, deploy sukses (health 200, image-proxy 403),
  E2E `sentcopy` PASS end-to-end: login → /api/send terjadwal → flush → salinan
  terverifikasi di folder Sent via doveadm.
- Commits: `aa173f0` (fitur + fix queue), `86c1947` (fix imapflow/deploy) — keduanya
  ter-push ke GitLab; production berjalan dgn sent-copy aktif.

## Sesi sebelumnya

## 2026-10-07 — Audit kesesuaian repo ↔ workspace ↔ development (source terbaru)

Status: COMPLETED
- Workspace kettinggalan 12 commit dari GitLab → pull ff-only ke `faacbd6` (main = origin/main).
- node_modules ↔ lockfile konsisten; build vite PASS; 64/64 suite test:* PASS.
- Production live (`1790766508154-7vr7i5`) = source `2f5fb59` — marker fitur ganti password
  terverifikasi di bundle live; beda hash chunk = injeksi VITE_API_KEY, bukan drift source.
- Fix `.ai-toolkit/project.env`: source of truth kini GitLab (komentar lama "Macbook" usang).
- Commit docs lokal menunggu keputusan push (deploy.sh `reset --hard` = unpushed rawan hilang).

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
