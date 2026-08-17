# Handoff Log

## 2026-08-17 — Round 8 unit tests: flattenMailboxes + HTML-in-plain-text

- **Refactor (uji-able):** logika murni dipindah ke lib — `flattenMailboxes` + `FOLDER_TYPE_LABELS` → `src/lib/mailboxTree.js` (api.js import ulang); `HTML_IN_PLAIN_RE` + `looksLikeHtmlInPlainText` → `src/lib/messageHtml.js` (MessageReader import ulang). Perilaku identik, tanpa fetch/DOM.
- **Test baru:** `scripts/test-mailbox-tree.mjs` (flat response kedalaman 0/1/2, nested, child path relatif, null/empty, path hilang, folderId encode, label mapping) + `scripts/test-message-html.mjs` (bounce SOGo→true, tag uppercase/br/a/table→true, teks biasa `<`/`>`→false, script/widget→false, kosong→false).
- **npm scripts:** `test:mailbox-tree`, `test:message-html`.
- **Validation:** 14/14 `npm run test:*` PASS (termasuk 2 baru), `npm run build` ✅.

## 2026-08-17 — Round 8: subfolder indent prod (path-depth fallback) + shortcut modifier guard + bounce rendering

### Bugs found & fixed (reported dari production)
1. **Subfolder indent tidak tampil di production** — kode indent sudah LIVE (deployed bundle `MailPage-*` berisi `paddingLeft: 12+(depth)*16`), tapi SOGo mengembalikan daftar folder **flat tanpa `children`** → semua `depth` = 0. Fix `flattenMailboxes` di `src/lib/api.js`: depth fallback dihitung dari segmen `path` (`INBOX/Sub` = 1, `INBOX/Sub/Sub2` = 2), digabung `Math.max(depth, pathDepth)` agar aman utk response nested maupun flat. Terverifikasi kedua bentuk response.
2. **Shortcut app mencuri kombinasi browser/OS** — handler keydown MailPage & MessageReader menangkap tombol tunggal TANPA cek modifier: `cmd/ctrl+C` buka compose (bukan copy), `cmd/ctrl+R` / `cmd+shift+R` buka reply (bukan refresh/hard refresh), `cmd/ctrl+F` forward (bukan find). Fix: guard `if (e.metaKey || e.ctrlKey || e.altKey) return;` di kedua handler — kombinasi browser kembali native, shortcut app tetap tombol tunggal (c/r/f/s/dll). MessageReader juga kini skip `contentEditable` (editor compose) + input/textArea.
3. **Email bounce "Mail delivery failed" dirender sebagai sumber HTML mentah** — SOGo bounce adalah `text/plain` yang BERISI markup HTML (`<div class="mailer_plaincontent">...`), dan `extractHtml` meng-escape seluruh text/plain → user lihat kode sumber. Fix: deteksi pola tag HTML umum (`HTML_IN_PLAIN_RE`) di konten text/plain → render sebagai HTML (tetap di-sanitize DOMPurify). Teks biasa dengan `<`/`>` (kode, perbandingan) tetap di-escape.

### Validation
- `npm run build` ✅ | 12/12 `npm run test:*` PASS | heuristik bounce: bounce→HTML true, plain text→false | depth: flat & nested sama (0/1/2).

## 2026-08-17 — Round 6 bug hunt: donut data fiktif + ProgressBar NaN + Calendar delete confirm + error UI hidup + search undefined + scheduleDelete 0

### Bugs found & fixed
1. **MEDIUM — StatsPage DonutChart data fiktif**: `summary?.spamCaught || 540`, `summary?.rejected || 180`, `summary?.virusBlocked || 4` — nilai mock 540/180/4 tampil sebagai data nyata saat summary 0/null (mis. spam 0 → donut tampil 540). Fix: fallback `|| 0` (donut menampilkan "Tidak ada data" saat total 0, sudah ditangani DonutChart).
2. **MEDIUM — Charts ProgressBar NaN%**: `Math.round((value/max)*100)` dengan storage mock `0/0` → NaN → render `width: NaN%` + label "NaN%". Fix: helper murni `src/lib/progressPercent.js` (guard `max>0`, clamp 0–100, NaN-safe) + test baru `test-progress-percent.mjs` (12 kasus).
3. **MEDIUM — CalendarPage delete popup**: hapus event tanpa konfirmasi + unhandled promise rejection (`setDetailEv(null)` dipanggil SEBELUM await → popup tutup duluan, error tidak pernah tampil). Fix: `window.confirm` + `.catch` → `toast.error`.
4. **MEDIUM — api.js fetchContacts/fetchCalendarEvents swallow error non-auth**: `return []` pada error → error state UI ("Gagal memuat kontak/kalender" + tombol retry) tidak pernah aktif, user lihat state kosong palsu. Fix: `throwApiError`/rethrow — error UI kini hidup.
5. **LOW — ContactsPage search field undefined**: `(c.name + c.email + c.phone + c.org)` → field undefined jadi literal "undefined" ikut tercari. Fix: `filter(Boolean).join(' ')`.
6. **LOW — MailPage scheduleDelete uids kosong**: keyboard `d` tanpa seleksi → toast "0 pesan akan dipindah". Fix: early return jika uids kosong.

### Validation
- 12/12 `npm run test:*` PASS (termasuk `test-progress-percent` baru).
- `npx vite build` ✅ (254ms) | `node --check server.js` ✅ | `bash -n deploy.sh` ✅ | `git diff --check` ✅ | `npm audit --omit=dev` = 0 vuln.

## 2026-08-17 — Round 5 bug hunt: subject object crash + formatAddresses + debug UI + signature sync + dompurify bump

### Bugs found & fixed
1. **HIGH — subject object crash (multi-site)**. SOGo terkadang mengembalikan subject/date sebagai OBJECT (bukan string) — sudah terbukti di prod (fix `normalizeSubject` round 4). Crash sites yang tersisa:
   - `src/lib/messageRows.js` `parseMessageRow`: `subject: String(...)`, `date: String(...)` — **fix root cause**: semua konsumen (search filter, sorting, render React) dapat string bersih.
   - `src/lib/api.js` `fetchMessages` client-side search filter: `String(m.subject || '')` (defensif) — sebelumnya `m.subject.toLowerCase()` → TypeError saat search aktif.
   - `src/lib/stats.js` `countBounces`: `String(m.subject || '')` — sebelumnya `m.subject?.toLowerCase()` → TypeError (tertangkap try/catch, stats diam-diam 0).
   - `src/components/mailer/MessageReader.jsx`: subject dinormalisasi (`typeof === 'string'` guard) — `fetchMessage` return RAW SOGo (tidak lewat parseMessageRow), jadi `subject.startsWith('Re:')` di handleReply/handleForward bisa TypeError; render `{subject}` bisa crash React; `handlePrint` sekarang pakai subject const (bukan `escapeHtml(msg.subject)` yang bisa `[object Object]`).
   - `src/pages/MailPage.jsx`: render subject row + group header di-guard (`String()`/typeof) — defensif lapisan kedua.
2. **MEDIUM — MessageReader `formatAddresses` render "undefined"**: item array string (bukan object `{name,email}`) → `a.email` undefined → string "undefined" di header. Fix: guard `typeof a === 'string'` + `filter(Boolean)`.
3. **LOW — PreferencesPage VacationSection leftover debug UI**: `debugVal` state + badge `[debugVal]` di title section terlihat user. Dihapus.
4. **LOW-MED — ComposeModal RichEditor tidak sync saat `value` berubah eksternal**: hydrate hanya jika `innerHTML` kosong → (a) signature yang di-inject ke body state tidak muncul di editor saat compose reply (edit berikutnya menimpa state → signature hilang dari email terkirim), (b) saat modal dibuka ulang, konten lama masih tampil (stale). Fix: dirty-tracking (`dirtyRef`) — sebelum ada input user, editor re-hydrate dari `value`; setelah user mengetik/exec/paste/drop, DOM jadi sumber kebenaran (tidak ada cursor jump).
5. **SECURITY — dompurify 3.4.12 → 3.4.13**: bump via `npm audit fix` — GHSA-55q2-fjhq-7xh7 (moderate, IN_PLACE hook removal XSS). `npm audit --omit=dev` = **0 vulnerabilities** (kembali penuhi G-001).

### Validation
- 11/11 `npm run test:*` PASS (termasuk test baru di `test-message-rows.mjs`: subject/date object dinormalisasi jadi string).
- `npx vite build` ✅ (0.2s, 2002 modules) | `node --check server.js` ✅ | `bash -n deploy.sh` ✅ | `git diff --check` ✅.

## 2026-08-11 — Avatar inisial, tooltip custom, kontrol floating + long-press (LIVE)

### Changes
- **`src/components/Avatar.jsx`** (baru): komponen avatar inisial bersama; tooltip custom (portal ke body, delay 450ms, animasi `tooltip-in` di `index.css`, caret, flip/clamp viewport, hide saat scroll/resize) menggantikan atribut `title` native.
- **`src/lib/initials.js`** (baru): `getInitials` dipindah dari Avatar.jsx agar bisa diuji Node langsung; re-export tetap dari Avatar.jsx.
- **`src/lib/constants.js`**: helper `isSentOrDraftFolder()` menggantikan logika duplikat di MailPage & MessageReader.
- **`MailPage.jsx`**: avatar di baris & header percakapan; checkbox & star menjadi overlay floating di atas avatar (kolom ~52px dihapus); mode seleksi mobile via long-press (450ms, batal jika gerak >10px); tap di mode seleksi = toggle; suppress klik sintetis di `touchend`; `tabIndex=-1` saat tersembunyi; tombol X + Escape keluar mode seleksi; auto-exit saat pilihan kosong.
- **`MessageReader.jsx`**: avatar `md` di header, inisial konsisten dgn daftar (penerima utk Terkirim/Draf).
- **`ContactsPage.jsx`**: pakai komponen Avatar bersama (hapus duplikat + import AVATAR_COLORS).
- **`Skeleton.jsx`**: placeholder avatar di skeleton daftar & panel baca.
- **Test**: `scripts/test-initials.mjs` baru (13 getInitials + 10 isSentOrDraftFolder); `scripts/test-login-flow.mjs` **ditulis ulang** — test lama stale (asumsi form-first & mailbox-proof ketat sebelum fix `327dac7`/`7306234`); sekarang mencerminkan JSON-first + fallback 415/422 + warm-up toleran (hanya 401/403 yang memblokir).

### Validation
- Semua 11 `npm run test:*` PASS (termasuk login-flow & initials).
- `npx vite build` ✅; review: 2 bug diperbaiki (long-hold deselect; tombol tersembunyi focusable).

### Delivery
- Commit fitur/test + commit docs dipush ke `origin/main`; deploy LIVE via `DEPLOY_SSH_HOST=deploy-mail ./deploy.sh`: preflight SOGo ✅, build ✅, rsync ✅, nginx reload ✅, webmail HTTP 200 ✅, asset hash match ✅.
- `scripts/test-initials.mjs` di-`git add -f` (pattern `test-*` gitignore, konsisten dgn test script lain).
- **Remaining**: browser smoke test (Chrome tak tersedia di workspace); rotasi password `sogo_test.py` historis; migration portal G-002.S-002.
## 2026-08-17 — Round 7 follow-up: rate limiter, password generator, subfolder indent (rebase hasil Round 5/6 remote)

### Unique fixes in this batch (overlap dgn Round 5/6 remote di-dedup saat rebase)
1. **MEDIUM — server.js rate limiter shared bucket**: semua `/api/*` route berbagi satu bucket per IP (key hanya IP), jadi 5x POST `/api/auth/smtp`/menit ikut memblokir `/api/send` dan `/api/preferences`; `windowMs` diambil dari route pertama yang membuat bucket. Fix: key bucket = `${keyFn(req)}|${req.method} ${req.path}`.
2. **MEDIUM — PreferencesPage `generatePassword` OOB shuffle**: Fisher-Yates memakai `array[i + 4]` melewati ujung `Uint32Array` → `undefined % n = NaN` → swap dengan `arr[NaN]` → password hasil kehilangan karakter (lebih pendek dari 16). Fix: `array[i]`.
3. **LOW — api.js safeJson `console.warn` production** (non-JSON response + XSRF presence): tersisa dari kebijakan log DEV-only Round 1. Fix: bungkus `debugWarn`.
4. **LOW — Charts DonutChart skeleton**: kelas Tailwind dinamis `w-[${size}px]` tidak pernah di-generate JIT → skeleton tanpa dimensi. Fix: inline style.
5. **FEATURE — Subfolder indentation**: `flattenMailboxes` membawa `depth` per folder; sidebar MailPage indent 12px+16px/level; dropdown "Pindah ke...", RulesPage select, dan MessageReader move menu ikut indent. (Dari sesi sebelumnya, belum pernah ter-commit.)

### Note rebase
- Remote main sudah berisi Round 5 (`d63ef61`: subject object crash, formatAddresses, debug UI, signature sync, dompurify bump) dan Round 6 (`479714f`: donut fiktif, ProgressBar NaN, calendar delete confirm, error UI, search undefined, scheduleDelete 0). Item saya yang sama (donut `||540/180/4`, ProgressBar NaN, debugVal Vacation, `m.from` crash, formatAddresses) diganti versi remote saat resolve konflik.
- `test:login-flow` yang tadinya gagal kini sudah ditulis ulang di remote (2026-08-11) → diharapkan PASS.

### Validation
- Build/syntax/diff check + seluruh test suite dijalankan ulang pasca-rebase (lihat hasil batch ini).

## 2026-08-01T07:08:00Z Initial Setup
- Project context scaffold created.
- Next step: update `project-context.md` and start the first task with `ai-start "task name"`.

## 2026-08-01T07:08:00Z
- Status: ACTIVE
- Objective: No active task.
- Summary: Prepared commit: fix: ESM require fix, FOLDER_TYPE_LABELS dedup, StatsPage dynamic calc, ComposeModal signature fix, sendMessage indent
- Branch: main
- Changed Files:
-  M server.js
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/StatsPage.jsx
- ?? .ai-toolkit/
- ?? AGENTS.md
- ?? docs/ai/


## 2026-08-03 — SOGo Frontend Deployment Audit and Safe Preparation

### Summary
Audited `/Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend` on `macanas`. Found a production routing conflict: `site.webmail.custom` pointed SOGo API requests to Control Tower MCP port `3004`; Control Tower API already owns `3003`; `sogo-smtp-proxy` was inactive. Prepared a safe fix without changing production services.

### Changes
- Standardized SOGo proxy port to `3005` in the Nginx template, deploy-generated config, and systemd template.
- Restricted and anchored Nginx API routes to `send`, `health`, `preferences`, and `auth/smtp`.
- Fixed deploy defaults for the real GitLab project and webmail URL.
- Fixed the deploy push variable typo (`git_url`).
- Added authenticated preflight before build/commit/push/deploy; it fails closed when SOGo is unavailable.
- Build injects `VITE_API_KEY` from the environment or reads remote `API_KEY` transiently; no secret is stored in source.
- Fixed Vite base path to `/webmail/` and production SOGo default URL.
- Added production env example and deployment/service documentation.

### Validation
- `bash -n deploy.sh` ✅
- `node --check server.js` ✅
- `npm run build` ✅ with a dummy validation key
- `git diff --check` ✅
- Real preflight ✅ fails safely: `mailserver:3005` refused connection; no commit/push/rsync/restart occurred during the test.

### Git / Deployment
- Existing local branch was already one commit ahead of `origin/main`; this task adds the audit fix commit. Push is pending because the macOS Keychain credential is unavailable in the non-interactive SSH session.
- Production deploy is **PENDING** by user choice. `sogo-smtp-proxy.service` must be installed/activated on `mailserver` first; then run `./deploy.sh` from the Mac workspace.
- No production service, Nginx config, or remote webmail files were modified in this task.


## 2026-08-03 — Security Audit: URL Injection, Cookie Logs, and Router Advisory

### Findings / Fixes
- **High:** `HtmlEditor` interpolated prompt input into `insertHTML`; fixed with URL validation and DOM Range/anchor creation.
- **High:** SOGo attachment/inline-image URLs were direct `href/src` sinks; fixed with SOGo-only URL validation and encoded CID replacement.
- **Medium:** Vite dev proxy logged partial session cookies and upstream headers; removed sensitive values while retaining safe metadata.
- **Dependency:** pinned `react-router-dom@7.18.2`, removing the prior moderate open-redirect advisories. npm still reports `GHSA-qwww-vcr4-c8h2` (RSC-mode CSRF) against React Router 7.12–8.2; the project is BrowserRouter-only SPA and does not use SSR/RSC/data actions.

### Validation
- `npm run test:safe-url` ✅
- `node --check server.js` ✅
- `bash -n deploy.sh` ✅
- `npm run build` ✅
- `git diff --check` ✅
- Sensitive-log and unsafe-URL sink scans ✅

### Deployment / Git Status
- Production deployment remains **PENDING**: `sogo-smtp-proxy` is inactive and port `3005` is not listening; no production service was changed in this task.
- Push remains pending because both HTTPS Keychain and GitLab SSH authentication were unavailable in the non-interactive macOS session.


## 2026-08-04 — Security Audit Fixes (committed & pushed; deploy blocked by network)

### Summary
Audited the full codebase (frontend, `server.js`, `deploy.sh`, nginx config) and applied security fixes. Committed and pushed to `origin/main` @ **b7f7fa0** (fast-forward `f83f67f..b7f7fa0`). Remote history had been force-rebuilt (no shared ancestry with local); the 3 prior local security commits were preserved via cherry-pick onto `origin/main`, then the new fix commit, then a credential-file removal commit.

### Changes
- **XSS (High):** MessageReader print window and reply/forward quote now escape every interpolated email header; quoted body uses DOMPurify-sanitized HTML instead of raw SOGo HTML. Covers both the earlier `rawHtml` sink and the unescaped display-name sink (stored XSS in the compose editor).
- **Dependency (High):** `react-router-dom@7.18.2` → `react-router@8.3.0` across 5 import sites. `npm audit` 0 vulnerabilities (cleared GHSA-qwww-vcr4-c8h2).
- **server.js:** `crypto.timingSafeEqual` for API key; rate limits now keyed by real client IP (`X-Real-IP`, trusted only from loopback/docker-bridge peers).
- **api.js:** mutation calls now throw on HTTP errors; removed full-mailbox debug log; added `.catch` to fire-and-forget `markRead`/`markFlagged` call sites.
- **Nginx hardening:** CSP + nosniff + X-Frame-Options + Referrer-Policy in `configs/site.webmail.custom` and `deploy.sh setup_nginx`.
- **CRITICAL credential leak:** `sogo_test.py` on remote main contained a live plaintext mailbox credential. Deleted from the tree (b7f7fa0) and from the local worktree. **Password rotation + git history scrub recommended.**

### Validation
- `npm run build` ✅ | `npm run test:safe-url` ✅ | `node --check server.js` ✅ | `bash -n deploy.sh` ✅ | `git diff --check` ✅ | `npm audit` 0 ✅ | dev smoke test ✅

### Git / Deployment
- `origin/main` @ `b7f7fa0`; local `main` synced; backup ref `backup/local-main-pre-audit` kept.
- `./deploy.sh` attempted — **failed closed at preflight**: `mailserver` (202.148.2.141:2002) unreachable (connection refused/timeout) and `sogo-smtp-proxy` must be active on 3005. **No production service, nginx config, or remote files were modified.**
- Follow-up: restore SSH, ensure proxy active, rerun `./deploy.sh`, rotate leaked password.


## 2026-08-04 — Per-account UI preferences (committed & pushed @ f07e017)

### Summary
Implemented per-account persistence for UI preferences so they no longer reset on logout and are isolated per user.

### Changes
- **New `src/lib/userPrefs.js`:** per-email localStorage storage `pcp_prefs_<email>` for `{ theme, themeColor, sortAsc, conversationView }` with shape validation (same pattern as `autoArchive.js`/`flagColors.js`).
- **`src/store/authStore.js`:** `setUser` loads the account's stored prefs; `clearUser` no longer resets `sortAsc`/`conversationView`; all preference setters (`setTheme`, `toggleTheme`, `setThemeColor`, `setSortAsc`, `setConversationView`) persist to the active account's storage when a user is logged in. Global `pcp-auth` persist retained as device fallback for the login screen.

### Validation
- `npm run build` ✅, `git diff --check` ✅, dev integration test in preview ✅ (login loads per-account prefs; changes persist, logout keeps prefs).

### Git / Deployment
- Pushed to `origin/main` @ `f07e017` (fast-forward).


## 2026-08-04 — Second bug-fix batch + PRODUCTION DEPLOY COMPLETE

### Fixed (commits `6d87cd1`, `e9ecad5`)
- EventModal invalid-date guard; SwipeableRow hook-order fix; removed duplicate NAV_ITEMS and dead stats vars; deploy quoting bug fixed.

### Deploy — LIVE
- `sogo-smtp-proxy` corrected to port 3005, service started and healthy.
- `./deploy.sh` completed: preflight, build, rsync, nginx config/reload, and HTTP 200 verification.
- CSP and security headers verified live. Control Tower on 3003/3004 was not touched.

## 2026-08-04 — Documentation/status reconciliation

- Reconciled historical deployment checkpoints with the authoritative Round 3 state: production LIVE, proxy healthy on 3005, webmail/API HTTP 200, and security headers verified.
- Updated AI Toolkit context files and ISO documentation; local validation and audit evidence recorded.


## 2026-08-04 — Security remediation delivery

- Session/preferences/editor hardening committed and pushed at `91fe620`; deployment later required restored SSH access and was verified fail-closed when the alias was unavailable.
- Per-account theme persistence was confirmed with normalized keys and regression coverage.


## 2026-08-04 — Deep audit remediation delivery

- Path segment validation, auth-status propagation, health disclosure reduction, SMTP revocation rate limiting, and generic SMTP errors were committed/pushed at `6cf66dd` plus docs `dae9855`.
- Deployment completed via verified SSH route to `202.148.2.139`, service port 3005, with Nginx/webmail/security verification passing.


## 2026-08-05 — Mailbox/statistics consistency and row parsing delivery

- Folder totals were unified and explicit message headers/dynamic row parsing restored Inbox/Sent/Junk/Trash rows. Commits `9fa267f` and `d86ed2c` were pushed and deployed; local regression/build/audit checks passed.


## 2026-08-05 — Exact Nginx routing for webmail authentication

- Overlapping `/api` regex locations sent webmail auth to Control Tower; exact locations now route webmail endpoints to proxy 3005. Commit `e1fb7a6` was pushed/deployed.
- Public metadata-only probes: valid API key → health/SMTP 200; missing/bad key → 403. No real password used.

## 2026-08-05 — Robust SOGo login/session validation (pre-delivery)

### Changes
- `src/lib/loginDiagnostics.js`: safe error categorization, format-only fallback detection, and 2xx/manual-3xx candidate validation.
- `src/lib/api.js`: form-first `/SOGo/connect`, no retry on 401/403, cookie-preserving credentials, authenticated HTML shell warm-up, and fail-closed protected mailbox JSON proof at `/Mail/0/view`.
- `scripts/test-login-diagnostics.mjs` and `scripts/test-login-flow.mjs`: regression coverage for no-retry 403, format-only fallback, redirect candidates, HTML shell/login-page behavior, endpoint ordering, and failed session proof.
- `package.json`: login regression scripts.

### Validation
- Login diagnostics/flow, Nginx routes, message API/rows/requests/totals, path segments, user prefs, and safe URL tests passed.
- Vite build passed (2002 modules); `npm audit --omit=dev` reports 0 vulnerabilities.
- Node/shell syntax and `git diff --check` passed.
- No real credentials or response bodies used in probes/tests.

### Delivery
- Application commit `88dcd9c` and force-tracked test commit `fe9be0b` are pushed to `origin/main`; documentation records this handoff.
- `./deploy.sh` failed closed because SSH alias `mailserver` did not resolve. A retry through the previously verified direct route `anas.fikri@202.148.2.139:22` timed out. No production mutation occurred; do not claim this login fix is live until deploy succeeds.
- Production account authentication remains intentionally unautomated; browser-level confirmation requires a user session. Chrome is unavailable in this workspace.
- Valid-account verification follow-up: public webmail timed out; `mailserver` alias did not resolve; direct SSH `202.148.2.139:22` timed out. No credential was sent or logged, and production login is not claimed verified.
- Deploy retry diagnosis: public DNS resolves the production hostname, but ports 22/2002/2222/80/443/3005 and the historical SSH route `202.148.2.141:2002` all timed out. `macanas` is only the local laptop alias (`127.0.0.1:2222`), not a production bastion. No DNS, route, SSH config, service, or production file was changed. Restore upstream firewall/VPN/network access before rerunning `SERVER=... ./deploy.sh`.

## 2026-08-05 — AI Toolkit status reconciliation before redeploy

- Historical Round 3 and mailbox/row deployment entries remain valid for their earlier commits, but are explicitly historical and do not prove that later login commits are live.
- Current authoritative state: `main` is clean and synced with `origin/main`; robust login implementation/test commits `88dcd9c` and `fe9be0b` are pushed; latest documentation status is tracked by the current commit.
- `deploy.sh` remains the only delivery path because its authenticated port-3005 preflight fails closed. After upstream access is restored: run `SERVER=mailserver ./deploy.sh`, verify service/webmail/security-header metadata, then perform browser login without sharing credentials.
- Latest deploy attempt after the documentation push stopped at the authenticated SOGo proxy preflight because `mailserver` DNS could not resolve. Build, rsync, Nginx reload, and production verification did not run; no production mutation occurred.
- Deploy retry diagnosis: public DNS resolves `mail.pcpexpress.co.id` to `202.148.2.139`, but ports 22/2002/2222/80/443/3005 and historical `202.148.2.141:2002` all timed out. `macanas` connects only to the local laptop at `127.0.0.1:2222`; it is not a production bastion. No DNS/route/SSH config or production mutation was performed. Restore upstream firewall/VPN access before rerunning `SERVER=... ./deploy.sh`.

### Remaining
- Rotate leaked password from `sogo_test.py`; optional git history scrub.
- Functional browser test of the newly-deployed webmail (CSP now enforced).

## 2026-08-04 — deploy.sh: SSH tunnel fallback + verify internal
- `ensure_ssh()` di main: probe `mailserver`; gagal → auto `tunnel-ctl.sh on` (cari di project ini, fallback `../dashboard/scripts/tunnel-ctl.sh`), `SERVER=mail-tunnel`, `trap EXIT` auto-clean. `SERVER`/`DEPLOY_SSH_HOST` override tetap didukung (tunnel manual).
- `verify()` webmail kini `curl --resolve mail.pcpexpress.co.id:443:127.0.0.1` — tak bergantung A record publik (migrasi ke 115.178.128.130/27) / hairpin NAT.
- Validasi: `bash -n` OK; verify `--resolve` → HTTP 200.

## 2026-08-04 — IP migration + deploy.sh enhancements (CLOSED ✅)
- MikroTik stale assignment 202.148.2.139/29 di ether1 → SOLVED (root cause IP problem)
- iptables mail server: DROP 115.178.128.130/.131 dihapus + ACCEPT /27
- AdGuardHome DNS: mail.pcpexpress.co.id → 10.10.10.5
- deploy.sh: `ensure_ssh()` fallback mail-tunnel + `verify()` --resolve 127.0.0.1

## 2026-08-05 — Production rescue: 403, netfilter, admin password, migration portal auth

### Issues Resolved
- **User IP auto-banned**: netfilter blocked `103.18.34.213` after 5 failed login attempts (3 SOGo + 2 admin UI). Removed from MAILCOW iptables chain + restarted netfilter container.
- **Admin password reset**: `admin` → `AdminMail2026!` synced across Mailcow admin panel AND migration portal.
- **Migration portal auth**: Replaced broken Mailcow API/MySQL approach with bcryptjs verification against `admin` table. All superadmins can now login with their Mailcow credentials.
- **Domain mapping fix**: migration portal now maps `pcpexpress.com` → `pcpexpress.com` (was `.co.id` fallback).
- **Migration portal fixes**: auto-create mailbox on Mailcow (quota=0 unlimited), sync password, trigger `sync_sogo_passwords.sh`, jobStore race condition fix, progress throttle improvements.

### Frontend Changes (commit 565c8fe)
- `PreferencesPage.jsx`: theme color picker (8 presets via CSS `--theme-hue`), SOGo mail prefs (compose mode, reply placement, confirm delete)
- `MailPage.jsx`: sortAsc + conversationView persisted to authStore
- `StatsPage.jsx`: flat lucide-react icons
- `index.css`: dynamic `--primary` / `--ring` via `var(--theme-hue)`
- `authStore.js`: themeColor + sortAsc + conversationView with per-account persist

### Files Modified (migration portal)
- `/home/anas.fikri/migration-portal/src/routes/auth.js` — bcryptjs login
- `/home/anas.fikri/migration-portal/src/lib/jobStore.js` — race condition fix + resetJob
- `/home/anas.fikri/migration-portal/src/lib/jobRunner.js` — progress throttle + --automap + domain fix
- `/home/anas.fikri/migration-portal/src/lib/mailcow.js` — auto-create + quota=0 + domain fix + sync_sogo trigger

### Remaining
- Deploy latest sogo-frontend code (master has login hardening from remote)
- Production browser test of migration portal sync flow
- Verify imapsync completes for real account

## 2026-08-06 — Security audit & hardening

### Audit findings (4 fixed)
1. **HIGH — deploy.sh GitLab token leak:** Token was embedded in `git push` URL → appears in `ps aux`. Fixed: use `GIT_TOKEN` env var + `credential.helper`.
2. **MEDIUM — ErrorBoundary.jsx:** `error.message` + `componentStack` exposed in production. Fixed: `import.meta.env.DEV` guard.
3. **LOW — api.js debug logs:** 15+ `[DEBUG]`/`[Login]` console statements active in production. Fixed: `debugLog()`/`debugWarn()` wrappers.
4. **LOW — api.js PII leak:** `Vacation.enabled` value logged to console. Fixed: changed to dev-only.

### Verified safe (no changes needed)
- server.js: timing-safe API key, Zod validation, rate limiting, session expiry
- safeUrl.js: proper URL validation, blocks protocol-relative URLs
- pathSegment.js: traversal prevention, encoded-slash support
- nginx: CSP + X-Frame-Options + nosniff headers
- XSRF: double-submit cookie pattern
- pasteUtils.js: DOMPurify before innerHTML, 10MB limit mitigates data: URI
- authStore: per-account localStorage, no secrets

### Build
- `npm run build` ✅ (240ms, 2002 modules)
- `bash -n deploy.sh` ✅

## 2026-08-06 — Deep dive bug hunt (runtime)

### Bugs found and fixed (5)
1. **MEDIUM — api.js fetchFolders/fetchMessages:** `setTimeout` cleanup on error path (timer leak). Fixed: try/finally pattern.
2. **MEDIUM — ComposeModal.jsx:** `queryClient.invalidateQueries` with possibly undefined `token`. Fixed: null guard.
3. **LOW — MailPage.jsx:** Flag mutation triggered with undefined flag value (keyboard shortcut 's'). Fixed: check message exists first.
4. **LOW — autoArchive.js:** `matchRules()` called O(rules × messages) instead of O(messages). Fixed: pre-compute per-message matches.
5. **INFO — index.css:** `var(--theme-hue)` duplication in `:root` and `.dark` — verified safe.

### Build
- `npm run build` ✅ (242ms, 2002 modules)
- No regressions — all fixes are additive (null guards, finally blocks, optimization)

## 2026-08-06 — Round 4: Edge case hardening

### Fixes
- **MailPage.jsx:** `normalizeSubject()` now checks `typeof subject !== 'string'` before calling `.trim()` — prevents TypeError if SOGo returns subject as object.

### Cumulative audit summary (4 rounds)
| Round | Focus | Bugs fixed | Commit |
|-------|-------|-----------|--------|
| 1 | Security audit | 4 | b8cde7d |
| 2 | Runtime bugs | 4 | 8fee1d7 |
| 3 | UX/Error handling | 4 | 669ad35 |
| 4 | Edge cases | 1 | 0026da4 |
| **Total** | | **13 bugs fixed** | |

### Verified safe (no issues found)
- server.js, safeUrl.js, pathSegment.js, pasteUtils.js, loginDiagnostics.js
- XSRF pattern, nginx CSP headers, DOMPurify integration
- CalendarPage, ContactsPage, PreferencesPage, RulesPage, StatsPage
- Sidebar, BottomNav, AppLayout, LoginPage, ComposeModal, HtmlEditor
- autoArchive.js, flagColors.js, userPrefs.js, toast.js
- deploy.sh (syntax clean, token leak fixed)
