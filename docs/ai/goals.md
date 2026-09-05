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

- Status: COMPLETE (2026-08-19 reconciliation) — docs/ai mencerminkan state deploy terkini; deployment records live.
- Success criteria: docs/ai files reflect verified surfaces, decisions, and handoff after every significant task.
- Latest evidence: production deploy aktif via SSH alias `deploy-mail` (`SERVER=deploy-mail ./deploy.sh`); legacy `mailserver` alias tidak lagi resolve — catatan lama yang menyebut "BLOCKED/NOT LIVE" sudah dikoreksi. HEAD `origin/main` = `2feb96c`, working tree bersih.
- Security hardening 2026-08-19 (`73870bd`..`2feb96c`) LIVE: OWASP audit (ErrorBoundary info-disclosure, CSP object-src/frame-src/worker-src + Permissions-Policy), anti tracking-pixel `/api/image-proxy` (SSRF guard + DNS-pin), server.js rate-limit `Retry-After` + session env config + email header-injection hardening, deploy.sh single-source nginx + backend deploy otomatis + verify image-proxy. Validation: 15/15 test PASS, build OK, npm audit 0 vuln, `/api/image-proxy` SSRF 403 + gambar eksternal 200.
- Feature batch 2026-08-19 LIVE: tombol hapus draft, infinite scroll + batas 5 bulan inbox, lampiran smart (ikon per tipe, unduh semua blob, total ukuran), preview gambar/PDF lightbox, filter email berlampiran, seksi lampiran rapi (shouldDisplayAttachment).
- Historical deploy records (`e9ecad5`, `9fa267f`, `d86ed2c`, `e1fb7a6`, `88dcd9c`, `fe9be0b`) remain as audit history below this reconciliation.

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

### Sub-goal G-001.S-006 — Round 8 bug hunt (2026-08-18)
- Status: COMPLETE — deployed LIVE at `956bfca`
- Bug hunt loop (5 pass): self-review, flow logic, edge case, cross-module, security.
- 7 bugs fixed: pagination reset, useMemo side effect, focusIdx bounds, quick reply validation, toast raw ID, silent error, body field.
- Validation: 20/20 test PASS, build OK, deploy LIVE.

### Sub-goal G-001.S-007 — Round 5 bug hunt (2026-08-17)
- Status: COMPLETE — deployed LIVE
- Subject object crash dihapus di semua jalur (parse normalisasi + guard search/stats/reader/render) ✅
- `formatAddresses` item string → "undefined" diperbaiki ✅
- Debug UI `[debugVal]` di VacationSection dihapus ✅
- ComposeModal RichEditor sync dengan `value` eksternal (signature di reply tampil; tidak stale saat reopen) ✅
- dompurify 3.4.13 → `npm audit --omit=dev` **0 vulnerabilities** ✅
- Validation: 11/11 test PASS (termasuk case baru subject object), build ✅

### Sub-goal G-001.S-007 — Round 6 bug hunt (2026-08-17)
- Status: COMPLETE — deployed LIVE at `479714f`
- StatsPage donut data fiktif (mock 540/180/4 saat data 0/null) → fallback `|| 0`, donut tampil "Tidak ada data" ✅
- Charts ProgressBar "NaN%" (storage 0/0) → helper murni `src/lib/progressPercent.js` (guard max<=0, clamp, NaN-safe) + test baru `test-progress-percent` (12 kasus) ✅
- CalendarPage delete popup: `window.confirm` + `.catch` → `toast.error` (sebelumnya tanpa konfirmasi + unhandled rejection) ✅
- `fetchContacts`/`fetchCalendarEvents` tidak lagi swallow error non-auth → error state UI hidup (kontak/kalender tidak tampil kosong palsu) ✅
- ContactsPage search: field undefined tidak lagi jadi literal "undefined" (filter(Boolean).join(' ')) ✅
- MailPage scheduleDelete: early return saat uids kosong (toast "0 pesan" hilang) ✅
- Validation: 12/12 test PASS, build ✅, `npm audit --omit=dev` 0 vuln | Deployed LIVE: rsync, nginx reload, webmail HTTP 200, asset `index-BBpNrAF9.js` live ✅

### Sub-goal G-001.S-008 — Round 7 follow-up: rate limiter, password generator, subfolder indent (2026-08-17)
- Status: COMPLETE (code) — commit/push/deploy di batch ini
- server.js rate limiter: bucket per route (`${clientIp}|${method} ${path}`) — sebelumnya semua `/api/*` berbagi satu bucket per IP, 5x POST `/api/auth/smtp` ikut memblokir `/api/send`/`/api/preferences` ✅
- PreferencesPage `generatePassword`: Fisher-Yates `array[i+4]` OOB → `array[i]` — password hasil tidak kehilangan karakter ✅
- api.js safeJson: 2 `console.warn` production → `debugWarn` (kebijakan log DEV-only) ✅
- Charts DonutChart skeleton: kelas Tailwind dinamis `w-[${size}px]` (tak ter-generate JIT) → inline style ✅
- Subfolder indentation: `depth` di `flattenMailboxes` + indent sidebar/dropdown/rules/move-menu ✅
- Validation: build ✅, syntax ✅, diff check ✅ (overlap dgn Round 5/6 remote sudah dedup saat rebase)

### Sub-goal G-001.S-009 — Security hardening & anti-tracking (2026-08-19)

- Status: COMPLETE — deployed LIVE (`73870bd`..`2feb96c`)
- OWASP audit: fix ErrorBoundary info-disclosure (regresi — error.message + componentStack dirender lagi ke user), CSP object-src 'none'/frame-src 'self'/worker-src 'self' + Permissions-Policy di nginx & server.js ✅
- Anti tracking-pixel: `GET /api/image-proxy` (SSRF guard + DNS-pin + redirect re-validate + image-only + size/timeout cap) + `proxyExternalImages` di MessageReader (render-only) + CSP `img-src 'self' data:` fail-closed ✅
- server.js: email validation tolak semua karakter kontrol (header injection), rate-limit `Retry-After`, session SMTP TTL/idle/cap configurable env ✅
- deploy.sh: nginx single-source (baca configs/site.webmail.custom) + deploy backend otomatis (change-detection md5) + verify `/api/image-proxy` ✅
- restore 5 test hilang + test baru (email-validation, ssrf-guard, image-proxy) ✅
- Validation: 15/15 test PASS, build OK, npm audit 0 vuln, `/api/image-proxy` SSRF 403 + external image 200 ✅

### Sub-goal G-001.S-010 — Security hardening batch 2: cookie httpOnly + paste-XSS + DoS (2026-08-19)

- Status: COMPLETE — deployed LIVE (`482df26`..`3cd39af`)
- **smtpToken → cookie httpOnly:** sesi SMTP (`/api/auth/smtp`) kini disimpan sebagai cookie `smtp_session` (HttpOnly + SameSite=Strict + Path=/api + Secure + Max-Age=TTL) — XSS tidak bisa mencuri token. Server baca token dari cookie (fallback header/body utk deploy bertahap); frontend tidak lagi menyimpan/mengirim token. Helper murni `src/lib/smtpCookie.js` + `test:smtp-cookie`. CSRF dipertahankan via SameSite=Strict + X-Api-Key (custom header → preflight).
- **Paste-XSS + anti tabnabbing:** hook DOMPurify `afterSanitizeAttributes` (`hardenAnchorNode` di pasteUtils.js) hapus `data:` href pada `<a>` — `ALLOWED_URI_REGEXP` izinkan `data:` utk img base64 composer, tapi bocor sbg link phishing saat paste — + paksa `rel="noopener noreferrer"` pada `<a target=_blank>`. Berlaku utk render email (MessageReader) DAN editor. `test:purify-hardening`.
- **DoS slow-drip test:** ekstrak fetch image proxy ke `src/lib/remoteImage.js` (timeout/limit/resolve injectable). Test slow-drip (1 byte/50ms tanpa selesai) → hard deadline 504 <3s (bukan hang); bonus fix branch `remaining<=0` (dulu destroy res tanpa settle promise → hang) → reject 504. `test:remote-image`.
- Validation: 28/28 test PASS, build OK, npm audit 0 vuln, deploy LIVE (webmail HTTP 200, SSRF 403, proxy gambar 200 `image/png`).

### Sub-goal G-001.S-011 — Mail freshness: auto-refresh + cross-tab sync (2026-09-02)

- Status: COMPLETE — deployed LIVE (`3062618` auto-refresh, `4a1e606` cross-tab, `dd7f252` verification record)
- **Auto-refresh daftar pesan:** root cause "webmail tidak menampilkan email terbaru" — query `messages` tidak pernah refetch otomatis (badge unseen saja poll 60s; `refetchOnWindowFocus: false` global). Fix: `refetchOnWindowFocus: true` per-query messages + invalidate `['messages', token, 'folderINBOX']` (`refetchType: 'active'`) saat unseenCount naik antar poll; search aktif tidak diganggu ✅
- **Anti-regresi pagination:** background refetch tidak lagi mengosongkan `extraMessages` lazy-load `/headers` — divalidasi terhadap `uids` fresh dari SOGo (buang uid yang sudah tidak ada); list tidak loncat balik ke 50 email pertama di tengah scroll ✅
- **Cross-tab sync domain 'mail':** bump versi dipasang di layer `api.js` setelah mutasi sukses (delete/move/markRead/markFlagged/junk/createFolder/deleteFolder/sendMessage — jalur SOGo + fallback SMTP proxy); MailPage `watchDomainVersion('mail')` → invalidate messages/unseen/unseen-per-folder/folders di tab lain. Versi = sinyal sukses (mutasi gagal tidak bump); gagal localStorage tidak menggagalkan mutasi ✅
- Test: `test-mail-crosstab.mjs` baru (bump per mutasi, scope akun, watcher fire, fail-no-bump) ✅
- Validation: 75/75 regression PASS, build OK, deploy 2x LIVE via `SERVER=deploy-mail ./deploy.sh` (webmail HTTP 200, `/api/health` 200 end-to-end, image-proxy SSRF 403, backend unchanged skip restart) ✅
- Catatan delivery: git push ke GitLab ditunda — trafik `gitlab.pcpexpress.com` diroute via `wg0` (WireGuard) yang down; 32 commit lokal ahead tanpa divergensi, cukup `git push origin main` setelah tunnel hidup.

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
- Status: COMPLETE (per user 2026-09-05) + audit dekomisioning Eranya tercatat di handoff.
- Cutover 16 Agu 2026 tereksekusi: MX/SPF/autodiscover seluruh domain pindah ke
  Mailcow + relay DNET; inbound .com terkirim ke mailcow (dovecot Saved); 0 koneksi
  dari IP Eranya 7 hari; imapsync berhenti (container hilang, tanpa cron).
- **Temuan audit**: jobs.json 527 akun = 413 done + 114 FAILED (source auth). Semua
  114 mailbox AKTIF di mailcow, 22+ terima mail 48 jam. Mail historis pra-cutover
  akun itu belum tersalin → risiko data loss bila Eranya dimusnahkan tanpa re-sync.
- Next: re-run 114 job gagal (bila akses Eranya dipulihkan) ATAU konfirmasi akun
  kosong sebelum terminasi tenant Eranya cloud.
