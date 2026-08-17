# Decision Log

## 2026-08-11 — Avatar inisial, tooltip custom, dan kontrol floating

- **Decision:** Satu komponen avatar bersama `src/components/Avatar.jsx`; logika inisial murni di `src/lib/initials.js` agar bisa diuji oleh Node tanpa transpile JSX. `ContactsPage` memakai komponen yang sama (hapus duplikat).
- **Reason:** Tiga lokasi (daftar email, percakapan, panel baca) butuh avatar identik; logika yang diduplikasi berisiko drift.
- **Decision:** Helper `isSentOrDraftFolder(folderId, folders)` di `src/lib/constants.js` sebagai satu sumber kebenaran untuk keputusan "penerima vs pengirim" (Terkirim/Draf).
- **Reason:** MailPage memakai `folders.find(...)` sementara MessageReader `folders.some(...)` — sudah mulai tidak konsisten.
- **Decision:** Ganti tooltip `title` native dengan tooltip custom (portal ke `document.body`, delay 450ms, animasi, caret, flip/clamp viewport, hide saat scroll/resize).
- **Reason:** Tooltip native tidak mengikuti tema, tidak konsisten, dan terpotong di kontainer overflow; portal menghindari clipping daftar yang scrollable.
- **Decision:** Checkbox & star di baris email menjadi **overlay floating di atas avatar** (hapus kolom ~52px). Desktop: muncul saat hover. Mobile (`hover:none and pointer:coarse`): star selalu tampil; checkbox hanya di mode seleksi.
- **Decision (mobile):** Seleksi via **long-press** (450ms, batal jika gerak >10px agar tidak bentrok scroll/swipe SwipeableRow); di mode seleksi, tap baris = toggle (pola Gmail); keluar via tombol X di toolbar bulk, Escape, atau auto-exit saat pilihan kosong. Klik sintetis browser setelah long-press ditekan dengan flag di `touchend` (bukan timestamp — aman utk penahanan berapa pun).
- **Decision:** `tabIndex={-1}` untuk kontrol yang tersembunyi (`pointer-events-none` tidak menghilangkan fokus keyboard); `select-none` + `-webkit-touch-callout:none` di baris.
- **Decision (test):** `test:initials` menambah cakupan `getInitials` + `isSentOrDraftFolder`; `test:login-flow` **ditulis ulang** agar mencerminkan perilaku production saat ini: `/SOGo/connect` JSON-first, fallback form hanya pada 415/422, dan warm-up toleran yang hanya memblokir 401/403.
- **Reason:** Test login-flow lama dibuat sebelum fix `327dac7` (JSON-first) dan `7306234` (warm-up toleran) sehingga mengasumsikan perilaku yang sudah tidak berlaku.

## 2026-08-01T07:08:00Z Initial AI Protocol Setup
Status: Accepted
Context: Standardized AI-readable project context was initialized.
Decision: Store shared project context under `docs/ai/` and automation config under `.ai-toolkit/project.env`.
Consequences: Any AI tool can resume work by reading repository-local context first.


## 2026-08-03 — Isolate SOGo SMTP Proxy from Control Tower

- **Decision:** Use host port `3005` for `sogo-smtp-proxy`; reserve `3003` for Control Tower API and `3004` for Control Tower MCP.
- **Reason:** Production Nginx had been routing SOGo `/api/*` to Control Tower MCP on `3004`, while the SOGo service was inactive.
- **Guardrail:** `deploy.sh` performs an authenticated `/api/health` preflight on the dedicated port before build, commit, push, or rsync.
- **Credential handling:** The browser build receives `VITE_API_KEY` from the deployment environment; when absent locally, `deploy.sh` reads `API_KEY` from the remote SOGo service `.env` only during the build and never writes it to Git.
- **Operational constraint:** This task does not install, restart, or modify production services.


## 2026-08-03 — Webmail URL and Session-Log Hardening

- **Decision:** Treat editor URLs and SOGo attachment/inline-image URLs as untrusted input. Editor links are created through DOM APIs; mail resources are restricted to `/SOGo/` paths and unsafe schemes are rejected.
- **Decision:** Never log SOGo cookie values or upstream proxy headers. The dev proxy may log only request/response metadata and a boolean session-presence flag.
- **Dependency:** `react-router-dom` is pinned to `7.18.2`, the latest available release. npm's remaining high advisory is RSC/SSR-specific; this app is a client-only `BrowserRouter` SPA with no loaders/actions/SSR/RSC. Revisit before adopting those features.

## 2026-08-04 — Security Audit Fixes (committed; deployment later completed)

- **React Router v8 migration:** `react-router-dom@7.18.2` → `react-router@8.3.0` (imports in App/LoginPage/AppLayout/Sidebar/BottomNav switched to `react-router`). Clears `GHSA-qwww-vcr4-c8h2`; `npm audit` = 0. v8 dropped the `react-router-dom` shim for the v7 line; the declarative APIs used (BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate) are unchanged.
- **XSS hardening (MessageReader):** print window and reply/forward quote are DOM sinks; all email header values (from/to/cc/date/subject — attacker-controlled display names) are escaped, and quoted bodies use the DOMPurify-sanitized `cleanHtml` instead of raw SOGo HTML.
- **Rate limiting:** key by real client IP — `X-Real-IP` is trusted only when the socket peer is loopback or a docker-bridge address (nginx overwrites it; direct external clients cannot spoof). Fixes the shared-bucket bug where all users behind nginx shared one limit.
- **API key comparison:** `crypto.timingSafeEqual` with a length guard.
- **CSP for /webmail:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ...; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` + nosniff/XFO/Referrer-Policy, mirrored in `configs/site.webmail.custom` and `deploy.sh setup_nginx`. Built index.html has no inline scripts, so `script-src 'self'` is safe.
- **CRITICAL — credential leak:** `sogo_test.py` committed on origin/main contained a live plaintext password (account credential). Deleted from the tree (b7f7fa0). Decision: rotate the exposed password and run `git filter-repo` history scrub; do not restore the file (it is gitignored locally and was removed from the worktree).

## 2026-08-04 — Per-account UI preferences

- **Decision:** UI preferences (theme light/dark, `themeColor`, `sortAsc`, `conversationView`) are stored per account in `localStorage` key `pcp_prefs_<email>` (via new `src/lib/userPrefs.js`, same pattern as `autoArchive`/`flagColors`). `setUser` loads the account's stored prefs on login; `clearUser` no longer resets them; every preference setter persists to the active account.
- **Why:** prefs previously lived in one global zustand key and were reset on logout/login/session-expiry, and accounts on a shared browser overwrote each other's settings.
- **Behavior notes:** a brand-new account gets an isolated default profile immediately on successful login (it never inherits the previous account's theme); returning accounts load their own profile. Preference keys normalize the email to lowercase/trimmed form. The global `pcp-auth` persist may still hold the anonymous login-screen fallback, but it is never used to initialize another account.

## 2026-08-04 — Production deploy of hardening + runtime bug fixes

- **Decision:** Deployed the accumulated hardening/fix batch to production (origin/main @ `e9ecad5`). Steps taken: activated `sogo-smtp-proxy` (was inactive since 2026-07-27), corrected its `.env` `PORT=3004 → 3005` (3004 is Control Tower MCP — violates the guardrail and caused the service to crash-loop on EADDRINUSE), updated the host `server.js` (backup kept), ran `./deploy.sh` (preflight → build → rsync → nginx config with CSP headers → reload → verify 200).
- **deploy.sh bug:** `get_production_api_key` had unescaped quotes in an inline ssh string — awk always failed at build time (masked previously because preflight failed first). Fixed with the heredoc pattern used by `preflight_sogo_proxy`.
- **Deploy mechanics note:** `deploy.sh` deploys `dist/` + nginx config only; the host `server.js` is updated manually via scp (keep backup `server.js.bak-YYYYMMDD`).

## 2026-08-04 — Documentation/status reconciliation

- **Decision:** Treat the latest Round 3 handoff as authoritative for deployment state: production is LIVE, not pending. Historical entries that say deployment was pending describe earlier checkpoints and remain as audit history.
- **Evidence:** `sogo-smtp-proxy` is healthy on port 3005; deployed webmail and `/api/health` returned HTTP 200; CSP, nosniff, XFO, and Referrer-Policy were verified live.
- **Workspace state:** `main` is clean and tracks `origin/main` at `67da690`. Current local validation passes for safe URLs, production dependency audit (0 vulnerabilities), Node/shell syntax, and diff whitespace. The Vite build is pending `npm install` because dependencies are not present in this workspace.

## 2026-08-04 — Deep audit path and session hardening

- **Decision:** Validate every dynamic SOGo URL segment through `src/lib/pathSegment.js`; permit `%2F` only for folder IDs required by nested mailboxes, reject all other percent escapes and traversal delimiters. This prevents a downstream URL decoder/proxy from turning encoded input into path traversal.
- **Decision:** Treat 401/403 as session-expiry signals consistently across read and mutation APIs. Only non-auth failures may return safe empty fallbacks for optional counts/lists.
- **Decision:** Keep `/api/health` metadata-minimal, rate-limit SMTP revocation, and return generic SMTP transport errors to clients while retaining server-side diagnostics.
- **Coverage:** Add `npm run test:path-segment`; the test is force-added because the legacy `test-*` ignore rule otherwise excludes it.
- **Delivery:** Commit `6cf66dd` and docs commit `dae9855` are on `origin/main`. After the default alias failed DNS, deployment used the verified SSH route `202.148.2.139:22` through a temporary wrapper. The remote unit was backed up, stale `PORT=3003` was corrected to `3005`, and `./deploy.sh` completed successfully. Post-deploy service, health, webmail, and security headers were verified LIVE; unrelated port-3003 `zeroclaw` was left untouched.

## 2026-08-04 — Consistent folder totals across Stats and Mail

- **Decision:** Treat SOGo folder metadata (`uids` when present, then explicit total fields) as the source of truth for folder counts. Keep MailPage's 250-row response cap for performance, but expose the full folder total separately.
- **Reason:** Stats previously counted the loaded message rows while Inbox/Sent displayed a capped list, causing mismatched numbers for folders larger than one page.
- **Coverage:** `npm run test:message-totals` verifies paginated UID metadata and safe null/fallback behavior.
- **Delivery:** Commit `9fa267f` was deployed and verified LIVE. Stats and MailPage share the authoritative folder total; production service health, webmail HTTP 200, live asset, and security headers passed.- **Reliability:** Because an external SIGTERM stopped `sogo-smtp-proxy` while `Restart=on-failure` treated it as a successful termination, the remote unit was backed up and changed narrowly to `Restart=always`. Six consecutive 5-second health samples remained `active/200`; port 3003/zeroclaw was not touched.

## 2026-08-05 — Explicit SOGo message rows for all mailbox folders

- **Decision:** Always send the same explicit `SOGO_MESSAGE_HEADERS` list for mailbox view/search requests; the folder remains a URL path parameter, so Inbox, Sent, Junk, Trash, and custom folders share one response contract.
- **Reason:** Some SOGo configurations returned `uids` and totals without `headers` rows when columns were omitted, leaving the UI empty while Stats still showed a nonzero count.
- **Parser contract:** Prefer named-column mapping, retain positional fallback only when no column row exists, treat missing optional columns as absent, and support array or singleton address values.
- **Coverage:** `test:message-rows` covers reordered/missing columns; `test:message-requests` covers payload builders; `test:message-api` mocks `fetchMessages`/`searchMessages` across Inbox/Sent/Junk/Trash and verifies paginated `uids` totals.
- **Delivery:** Commit `d86ed2c` was pushed and deployed. Production webmail returned HTTP 200 with CSP/nosniff/XFO/Referrer-Policy, proxy health was authenticated `200`, and 6/6 stability samples were `active/200`. The live asset is `index-CVQcTv-t.js`; browser-level account verification remains pending because Chrome is unavailable here.

## 2026-08-05 — Exact Nginx routing for webmail authentication

- **Decision:** Use exact-match Nginx locations for webmail `/api/health`, `/api/auth/smtp`, `/api/preferences`, and `/api/send`; do not use one broad regex that can overlap with Control Tower's `/api` regex routes.
- **Reason:** Nginx's overlapping regex configuration sent public webmail API requests to the wrong backend. The SOGo proxy on 3005 correctly requires the API key, but public behavior previously matched the Control Tower route (health open and SMTP unauthorized), causing login to fail during SMTP session registration.
- **Guardrail:** Port 3003/zeroclaw remains unrelated and untouched. The route regression test asserts each exact location's proxy target in both source config and deploy template.
- **Delivery:** `e1fb7a6` deployed; valid-key public health/SMTP dummy probes return 200, missing/bad-key probes return 403.

## 2026-08-05 — Fail-closed SOGo login session proof

- **Decision:** Send native form-encoded credentials first; permit one JSON retry only when SOGo explicitly rejects the representation (400/415/422 format signals). Never retry 401/403, preventing accidental repeated password attempts and lockout amplification.
- **Decision:** Treat `/SOGo/connect` success as provisional. Accept 2xx or manual same-origin 3xx candidates, then prime the authenticated HTML shell and require `/SOGo/so/<user>/Mail/0/view` to return JSON containing `mailboxes`. This endpoint is the session proof because browser JavaScript cannot inspect `Set-Cookie`.
- **Decision:** Reject login-page markers and arbitrary upstream HTML, redact response bodies, and expose only whitelisted account/policy/transport diagnostics.
- **Coverage:** `test:login-diagnostics` and `test:login-flow` cover no-retry 403, format-only fallback, redirect candidates, HTML shell acceptance, login HTML rejection, mailbox proof, and endpoint order.
- **Delivery status:** implementation/test commits `88dcd9c` and `fe9be0b` are pushed. Production delivery is not complete: `mailserver` DNS failed and all tested SSH/web ports timed out; `deploy.sh` correctly made no production changes. Historical Round 3 LIVE entries refer only to earlier commits.

## 2026-08-05 — Migration Portal Auth: bcryptjs against Mailcow admin table

- **Decision:** Replaced Mailcow API + MySQL fallback auth in migration portal with bcryptjs-based password verification against the `admin` table.
- **Reason:** The previous approach had two failure modes: (1) Mailcow API `/api/v1/get/status/containers` rejects Basic Auth — requires X-API-Key; (2) MySQL fallback had SQL quoting bugs and `$` sign escaping issues. bcryptjs provides a direct, reliable, and consistent comparison with zero network dependency.
- **Guardrail:** Queries `admin` WHERE `superadmin=1 AND active=1 LIMIT 1`. Passwords stored as `{BLF-CRYPT}$2y$...` are parsed and verified via `bcrypt.compareSync()`.

## 2026-08-05 — Theme Color System: var(--theme-hue)

- **Decision:** Split `--primary` and `--ring` CSS custom properties to use `var(--theme-hue, 221)` so the hue can be changed without duplicating CSS rules.
- **Reason:** Avoids 8× CSS block duplication per theme. Single `--theme-hue` variable set via JavaScript on `<html>` controls all primary accent colors.

## 2026-08-05 — Inbox Prefs: Persist to authStore (per-account)

- **Decision:** `sortAsc` and `conversationView` moved from local `useState` to `authStore` with `persistPrefs()` → per-account localStorage (`pcp-prefs-<email>`).
- **Reason:** Preferences survive logout/login and are scoped per email account.

## 2026-08-17 — Round 5 bug hunt decisions

- **Decision (rate limiter):** scope setiap rate-limit bucket per route (`${clientIp}|${method} ${path}`), bukan hanya per IP. Semua `/api/*` sebelumnya berbagi satu bucket per IP, sehingga batas 5/menit `/api/auth/smtp` ikut memblokir `/api/send` dan `/api/preferences`.
- **Decision (password generator):** indeks acak Fisher-Yates harus berasal dari `Uint32Array` yang sama (`array[i]`), bukan `array[i+4]` yang melewati ujung buffer → NaN index menghilangkan karakter password.
- **Decision (stats):** jangan pernah menampilkan nilai mock sebagai data nyata. Fallback `|| 540/180/4/546` diganti `?? 0`; ProgressBar guard `max > 0` agar pct tidak NaN.
- **Decision (UI debug):** semua state debug (mis. `debugVal` Vacation) harus dibuang sebelum produksi — konsisten dengan kebijakan log DEV-only dari audit Round 1.

## 2026-08-06 — Security Audit: Production Hardening

- **Decision (ErrorBoundary):** Hide `error.message` and `componentStack` behind `import.meta.env.DEV` guard.
- **Reason:** Error details in production UI leak internal module paths and stack traces to any user who triggers a render error.
- **Decision (api.js logging):** Wrap all `[DEBUG]` and `[Login]` console.log/warn calls with `debugLog()`/`debugWarn()` — no-op in production.
- **Reason:** 15+ debug statements exposed request status, folder state, and vacation preferences in the browser console.
- **Decision (deploy.sh):** Replace URL-embedded GitLab token with `git -c credential.helper` using `$GIT_TOKEN` env var.
- **Reason:** Token in URL appears in `ps aux` process listing on macOS and Linux.
