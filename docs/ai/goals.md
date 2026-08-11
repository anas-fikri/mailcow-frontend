# Goals & Sub-goals

## Goal G-001 — Secure, maintainable webmail SPA

Status: ACTIVE
Owner: dev team (anas.fikri)
Success criteria:
  - npm audit reports 0 known vulnerabilities for production dependencies.
  - No unescaped HTML from email content reaches DOM sinks (innerHTML/document.write) without DOMPurify.
  - All API endpoints require the API key and are rate-limited per real client.
  - Production webmail is served with CSP + clickjacking headers.

### Sub-goal G-001.S-001 — Security audit & remediation (2026-08-04)

- Status: COMPLETE (code and production deployment)
- Success criteria:
  - XSS via print window and reply/forward quote eliminated (escape all header values; sanitized quote body).
  - react-router upgraded to 8.3.0 → `npm audit` 0 vulnerabilities (was 2 high, GHSA-qwww-vcr4-c8h2).
  - Rate limiting keyed by real client IP; timing-safe API key comparison.
  - CSP/nosniff/XFO/Referrer-Policy added to nginx config.
  - Committed credential file (`sogo_test.py`) removed from the tree; password rotation + history scrub flagged.
- Validation: `npm run build` ✅, `npm run test:safe-url` ✅, `node --check server.js` ✅, `bash -n deploy.sh` ✅, `git diff --check` ✅, dev smoke test (login render + route guard) ✅.
- Deploy: COMPLETE and LIVE. The Round 3 batch was deployed after restoring mailserver access, activating `sogo-smtp-proxy` on port 3005, syncing `dist/`, applying Nginx security headers, reloading Nginx, and verifying webmail/API HTTP 200. The deployed application code is at `e9ecad5`; current `main` is synced with `origin/main` at `67da690` after documentation reconciliation.

### Sub-goal G-001.S-002 — Documentation currency

- Status: ACTIVE — historical deployment records are complete, but current login delivery status must remain synchronized.
- Success criteria: docs/ai files reflect verified surfaces, decisions, and handoff after every significant task.
- Latest evidence: prior remediation patch reviewed; workspace build, safe-url test, syntax checks, production audit (0 vulnerabilities), and diff check pass. Commit/push completed at `91fe620`; deploy attempt was blocked at fail-closed SSH preflight because `mailserver` could not be resolved. A new deep-audit remediation batch is now validated locally and pending commit/push/deploy.
- New coverage: `npm run test:path-segment` verifies nested-folder `%2F` compatibility and rejects encoded traversal/query payloads.
- Deep-audit remediation commit/push: `6cf66dd` is present on `origin/main`; docs status commit is `dae9855`. Production deploy is COMPLETE and LIVE: service active on 3005, authenticated health HTTP 200, webmail HTTP/2 200, and security headers verified.
- Mailbox/statistics consistency remediation `9fa267f` is deployed and LIVE. Stats and MailPage now use the same authoritative SOGo folder total instead of different loaded-page lengths; build, rsync, Nginx reload, webmail HTTP 200, live asset, and proxy stability verification passed. Proxy unit reliability is now `Restart=always` after external SIGTERM behavior was observed.
- Follow-up mailbox row remediation is COMPLETE and LIVE at commit `d86ed2c`: explicit SOGo headers, dynamic row parsing, and mocked Inbox/Sent/Junk/Trash API coverage pass; public webmail HTTP 200, latest asset `index-CVQcTv-t.js`, proxy health `active/200`, and 6/6 stability samples verified.
- Login routing remediation COMPLETE and LIVE at `e1fb7a6`: exact Nginx webmail API locations now route auth/session endpoints to proxy 3005, avoiding Control Tower regex overlap; valid-key health/SMTP probes return 200 and missing/bad-key probes return 403.
- Robust SOGo login/session validation is locally COMPLETE at commits `88dcd9c` + `fe9be0b`: native form-first auth, format-only fallback, safe error diagnostics, authenticated HTML-shell support, and protected mailbox JSON proof. Local full validation passes; no real password was used. Production delivery is BLOCKED by upstream network/firewall/VPN reachability and is not claimed LIVE.

### Sub-goal G-001.S-003 — Theme color & inbox preference persistence (2026-08-05)
- Status: COMPLETE
- 8-color theme picker via CSS `var(--theme-hue)` ✅ | sortAsc + conversationView persisted per-account ✅
- SOGo mail preferences (compose mode, reply placement, confirm delete) ✅
- Deployed at `565c8fe` ✅

### Sub-goal G-001.S-004 — Security audit & production hardening (2026-08-06)
- Status: COMPLETE
- 4 vulnerabilities found and fixed: deploy.sh token leak (HIGH), ErrorBoundary exposure (MEDIUM), api.js debug logs (LOW), Vacation.enabled PII (LOW) ✅
- Verified safe: server.js, safeUrl.js, pathSegment.js, nginx CSP, XSRF pattern, DOMPurify ✅
- Deployed at `b8cde7d` ✅ | ai-toolkit docs updated ✅

### Sub-goal G-001.S-005 — Avatar inisial, tooltip custom, kontrol floating (2026-08-11)
- Status: COMPLETE — deployed LIVE
- Avatar inisial di daftar email, header percakapan, panel baca, dan kontak (komponen bersama `Avatar.jsx`, logika `getInitials` di `initials.js`) ✅
- Tooltip custom (portal, delay, animasi, anti-overflow) menggantikan `title` native ✅
- Checkbox & star jadi overlay floating di avatar (hemat ~52px/baris); mobile pakai long-press untuk mode seleksi ✅
- Helper `isSentOrDraftFolder()` di `constants.js` (satu sumber kebenaran) ✅
- Test: `test:initials` baru; `test:login-flow` diperbarui ke perilaku JSON-first + warm-up toleran ✅
- Validation: 11/11 test PASS, build ✅ | Deployed: preflight/build/rsync/nginx/HTTP 200/asset match ✅

## Goal G-002 — Migration Portal (Eranya → Mailcow)

Status: ACTIVE
Owner: dev team (anas.fikri)
Success criteria:
  - Migration portal authenticates admins using the same credentials as Mailcow admin panel (bcryptjs against `admin` table).
  - Auto-creates Mailcow mailbox if not exists (quota=0 unlimited), syncs password, triggers `sync_sogo_passwords.sh`.
  - imapsync runs from Eranya (`pcpexpress.com`) to Mailcow (`pcpexpress.com`) with `--automap` for folder name matching.
  - Progress streamed real-time via SSE; status persisted in `jobs.json` with race-condition guard.

### Sub-goal G-002.S-001 — Auth & auto-provisioning (2026-08-05)
- Status: COMPLETE
- Admin login via bcryptjs ✅ | Auto-create mailbox + password sync ✅ | Domain mapping fixed ✅ | Quota=0 ✅
- E2E test: login, token generation, job status, SSE progress — all pass.

### Sub-goal G-002.S-002 — Production sync validation
- Status: PENDING
- End-user sync flow needs browser testing with real Eranya credentials.
- Verify Sent/Trash/Draft folders are correctly mapped by `--automap`.
