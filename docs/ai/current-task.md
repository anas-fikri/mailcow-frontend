# Current Task

Status: COMPLETED
Task ID: incident-login-massal-2026-08-18
Started At: 2026-08-18
Updated At: 2026-08-18T03:15:00Z
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## INCIDENT 2026-08-18 — login webmail gagal massal
- Kantor (115.178.128.130) timeout = MikroTik spam-blocklist (spam-detect.sh) + CrowdSec ban → **RESOLVED**: unban + allowlist CrowdSec + whitelist prefix `115.178.128.` di spam-detect.sh → HTTP 200 ✅ stabil 2+ siklus.
- Cabang "Login ditolak SOGo" = password sebagian user tidak cocok dgn DB (bukan bug sistem; sync OK, 195–434 user sukses/hari). Brute force 16 Agu: 9271 attempt (baseline 400–600).
- TODO user: reset password akun terdampak + perbaiki mesin kantor yang login-loop (abdul.latif dll). Detail: docs/ai/handoff.md + knowledge.md.

## Sebelumnya — Sync workspace — 2026-08-18
- Server innaka `/home/anas.fikri/mailcow-frontend` = clean, sudah dipush ke GitLab, punya 2 commit lebih baru dari workspace: `8a3867d` (fix: 401/403 /api/* tidak picu session-expired + persist smtpToken) + `d427590` (docs handoff).
- Workspace fast-forward `f99431c → d427590` — kini identik dgn origin/main & server.
- Validasi ulang di workspace: **15/15 `npm run test:*` PASS** (termasuk `test:preferences-fallback` baru) + `npx vite build` ✅.
- `knowledge.md` diisi (sebelumnya kosong); docs di-commit + push.

## Fix /api/preferences 401 + persist smtpToken (sebelumnya, dari server innaka)

### Gejala
- Setelah reload halaman, console: `GET /api/preferences → 401` → sebelumnya memicu force logout + redirect login + mailbox kosong ("tadi muncul, sekarang kosong").

### Root cause
- `smtpToken` (UUID sesi SMTP proxy dari `/api/auth/smtp`) hanya di memori → hilang saat reload.
- `/api/preferences` butuh `X-SMTP-Token` valid (`requireSmtpSession` → 401; bukan soal API key — 401 ≠ 403).
- `fetchPreferences` lama memanggil `throwApiError(401)` → `_onSessionExpired` → clearUser + redirect → `fetchFolders` di-abort → mailbox kosong.
- SOGo `/send` = 501 → `/api/send` (butuh smtpToken) jalur kirim yang bekerja → tanpa token, kirim email gagal setelah reload.

### Changes
- `src/lib/api.js` — `fetchPreferences`: 401/403 dari `/api/*` TIDAK lagi memicu session-expired; graceful fallback ke localStorage (resolve, bukan reject).
- `src/store/authStore.js` — `smtpToken` di-persist (partialize); kredensial (user+pass) tetap tidak pernah dipersist.
- `scripts/test-preferences-fallback.mjs` (baru) + `package.json` `test:preferences-fallback`.

### Validation
- 15/15 `npm run test:*` PASS | `npx vite build` ✅

### Delivery
- Commit/push + deploy LIVE via `DEPLOY_SSH_HOST=deploy-mail ./deploy.sh`.

## Round 9.7 — tuntas — IP login bukan sinyal kompromi
- `182.2.178.5` = Telkomsel mobile, `36.94.139.26` = Telkom ISP — dua-duanya Indonesia, normal.
- Verdict: akun aman (0 SMTP AUTH, volume normal); user menolak rotasi password.

## Round 9.6 — hard-refresh → logout
- `SOGoSessionTimeout` tidak diset → default 30 menit idle → refresh setelah jeda = 403 = kick login.
- Cookie sesi per-domain: pindah .co.id ↔ .com = logout.
- **Pending:** konfirmasi user utk set `SOGoSessionTimeout = 480` + restart SOGo.

## Round 9.5 — panduan email per-klien + port alternatif
- Port terverifikasi: internet → 993/465/587 BLOCK, 1993/1465/1587 OPEN; internal → kebalikan. Dua set port disajikan dgn badge.
- `public/help/email-settings.html` diperluas: tabel port standar/alternatif + langkah per-klien (Outlook Windows, Outlook macOS, Apple Mail, Thunderbird), semua SSL/TLS.
- LIVE di kedua domain (HTTP 200), push `9ae9097` + docs `de9f4e1`.
- **Pending user:** konfirmasi IP login 182.2.178.5 & 36.94.139.26; opsional SPF -all; error lama .co.id (pcp_last_error).

## Round 9.4 — investigasi banjir bounce "Mail delivery failed"
- **Sumber 1 (selesai):** relay keluar semalam port 25 tanpa auth → dnet tolak → bounce. Relay kini :26 + SASL, terbukti sent. Alamat test (utester/dedysugiarto/uutteesstteerr) = tes manual, bukan spam.
- **Sumber 2 (eksternal):** spoofing From via smtp.mailchannels.net — di luar kendali; DMARC quarantine + SPF ~all sudah membatasi.
- **Akun aman:** 0 SMTP AUTH 48 jam; volume keluar normal; tidak ada script server pengirim.
- **Pending:** konfirmasi IP login 182.2.178.5 & 36.94.139.26; opsional rotasi password; opsional SPF -all.

## Round 9.2 — login NetworkError di mail.pcpexpress.com
- `VITE_SOGO_BASE_URL` hardcoded `.co.id` → fetch cross-origin dari `.com` → CORS + CSP `connect-src 'self'` block → NetworkError. Fix: SOGO_BASE same-origin (relatif) di api.js + MessageReader, deploy.sh default kosong, env override tetap didukung.
- Bundle ter-deploy 0 referensi absolut; cert SAN sudah cover `.com`; push `739a150`.
- **Open:** error "Terjadi Kesalahan" di .co.id (sebelumnya) — tunggu `pcp_last_error` dari user; hardening + capture sudah LIVE.

## Round 9 — sidebar folder expand/collapse
- Chevron toggle di folder ber-anak (INBOX, Backup report); anak re-render hanya saat parent terbuka; default expanded.
- `childrenByParent` useMemo dari daftar flat (parentId = path tanpa segmen terakhir, encode %2F) + `collapsedFolders` Set + `renderFolderRow` rekursif.
- 14/14 test PASS, build ✅, simulasi tree dgn hierarki Dovecot asli ✅.

## Context — 3 laporan dari production
1. **Subfolder inbox tidak ber-indent di production** — kode indent sudah LIVE (bundle `MailPage-*` mengandung `paddingLeft: 12+(depth)*16`), tapi SOGo mengembalikan folder flat tanpa `children` → semua depth 0. Fix: fallback depth dari segmen `path` di `flattenMailboxes` (`Math.max(depth, pathDepth)`).
2. **Shortcut cmd/ctrl+C, cmd/ctrl+R, cmd+shift+R diculik app** — handler keydown tanpa cek modifier: copy → compose, refresh → reply. Fix: guard `metaKey||ctrlKey||altKey` di MailPage + MessageReader (kombo browser kembali native; shortcut app tetap tombol tunggal).
3. **Bounce "Mail delivery failed" dirender mentah** — text/plain berisi markup HTML, `extractHtml` meng-escape semua. Fix: deteksi tag HTML umum → render sanitized (DOMPurify tetap aktif).

## Validation
- `npm run build` ✅ | **14/14 `npm run test:*` PASS** ✅ (termasuk 2 test baru: `test:mailbox-tree`, `test:message-html`) | heuristik: bounce→HTML true, teks biasa (`<`,`>`)→false ✅ | depth flat & nested konsisten (0/1/2) ✅.
- Logika murni dipindah ke `src/lib/mailboxTree.js` (flattenMailboxes) & `src/lib/messageHtml.js` (looksLikeHtmlInPlainText) agar bisa diuji Node tanpa JSX/transpile.

## Delivery — COMPLETE & LIVE
- Commit `00c3693` dipush ke origin/main ✅.
- `./deploy.sh`: preflight ✅, build ✅, rsync ✅, nginx reload ✅, webmail HTTP 200 ✅.
- Bundle terverifikasi: `Math.max(n,c)` (depth fallback) di api chunk, `e.metaKey||e.ctrlKey||e.altKey` di MailPage, regex bounce `(?:div|p|br|table|...` di chunk MessageReader ✅.
- **Remaining**: user memverifikasi indent subfolder + bounce ter-render + cmd/ctrl+C/R native di browser (hard refresh sekali utk buang cache index lama).

## Round 7 (sebelumnya) — COMPLETE & LIVE
- [x] **MEDIUM** StatsPage DonutChart data fiktif: `|| 540` / `|| 180` / `|| 4` → `|| 0` (donut menampilkan "Tidak ada data" saat total 0).
- [x] **MEDIUM** Charts ProgressBar NaN% (storage 0/0): helper murni `src/lib/progressPercent.js` + test baru (12 kasus, guard max<=0, clamp, NaN-safe).
- [x] **MEDIUM** CalendarPage delete popup: `window.confirm` + `.catch` → `toast.error` (sebelumnya tanpa konfirmasi + unhandled rejection, popup tutup duluan).
- [x] **MEDIUM** api.js fetchContacts/fetchCalendarEvents swallow error non-auth → error UI hidup (state kosong palsu hilang).
- [x] **LOW** ContactsPage search field undefined → literal "undefined" ikut tercari; fix `filter(Boolean).join(' ')`.
- [x] **LOW** MailPage scheduleDelete uids kosong → early return (toast "0 pesan" hilang).
- [x] Validation: 12/12 test PASS (termasuk test-progress-percent baru), build ✅, node --check ✅, bash -n ✅, npm audit 0 vuln.

## Objective (sebelumnya)
UI batch: avatar inisial di daftar email, header percakapan, dan panel baca (MessageReader); tooltip custom; refactor checkbox & star jadi floating overlay di atas avatar (hemat ~52px/baris) dengan long-press untuk seleksi di mobile; unit test untuk logika avatar; perbaiki test login-flow yang stale. **COMPLETE — LIVE di production.**

## Deliverables (sebelumnya)

### 1. Avatar inisial (semua lokasi)
- Komponen bersama `src/components/Avatar.jsx` + logika murni `src/lib/initials.js` (`getInitials`).
- Dipasang di: baris daftar email (`sm`, 32px), header grup percakapan (pengirim pertama), panel baca MessageReader (`md`, 36px), dan daftar kontak (refactor ContactsPage ke komponen bersama).
- Warna deterministik dari `AVATAR_COLORS`; inisial dari nama display, fallback local-part email, placeholder → `?` tanpa tooltip.
- Helper bersama `isSentOrDraftFolder(folderId, folders)` di `src/lib/constants.js` menggantikan logika duplikat MailPage/MessageReader (penerima utk Terkirim/Draf, pengirim utk lainnya).

### 2. Tooltip custom (menggantikan atribut `title` native)
- Portal ke `document.body` (tidak terpotong kontainer scroll), delay 450ms, animasi `tooltip-in`, caret, flip ke kiri jika overflow kanan, clamp viewport, hide saat scroll/resize.
- Keyframe `tooltip-in` di `src/index.css`.

### 3. Kontrol floating checkbox & star (desktop + mobile)
- Kolom checkbox (~30px) dan star (~22px) dihapus dari baris; keduanya kini overlay `absolute` di atas avatar.
- Desktop: muncul saat row-hover; tetap tampil jika terpilih/berflag.
- Mobile (matchMedia `hover:none and pointer:coarse`): star selalu tampil; checkbox tampil hanya di mode seleksi.
- Mode seleksi mobile: **long-press** baris 450ms (batal jika gerak >10px) → masuk mode seleksi + pilih baris; tap = toggle (pola Gmail); tombol **X** di toolbar bulk / Escape / auto-exit saat kosong.
- Klik sintetis browser setelah long-press ditekan via flag di `touchend` (aman berapa pun lama penahanan); `tabIndex=-1` saat kontrol tersembunyi; `select-none` + `-webkit-touch-callout:none`; state long-press dibersihkan saat ganti folder.

### 4. Test
- `scripts/test-initials.mjs` (baru, `npm run test:initials`): 13 kasus `getInitials` + 10 kasus `isSentOrDraftFolder`, menguji kode asli.
- `scripts/test-login-flow.mjs` (ditulis ulang): test lama **stale** — mengasumsikan form-first + mailbox-proof ketat, padahal alur sekarang JSON-first (`327dac7`) dengan warm-up toleran (`7306234`). Kini menguji perilaku production: 403 no-retry, fallback form hanya 415/422, mailbox 401 = hard blocker, 5xx/HTML mailbox tidak memblokir.

## Validation
- **Semua 12 test PASS**: safe-url, user-prefs, path-segment, message-totals, message-rows, message-requests, message-api, nginx-routes, login-diagnostics, login-flow, initials, progress-percent.
- `npx vite build` ✅ bersih.
- Code review (tooltip positioning, long-press race, floating overlay) — 2 bug ditemukan & diperbaiki: long-hold deselect + tombol tersembunyi tetap focusable.

## Git / Deployment
- Commit fitur + test + docs dipush ke `origin/main` dan **deploy LIVE** via `DEPLOY_SSH_HOST=deploy-mail ./deploy.sh` (preflight SOGo ✅, build ✅, rsync ✅, nginx reload ✅, webmail HTTP 200 ✅, asset hash terverifikasi).
- `scripts/test-initials.mjs` butuh `git add -f` (pattern `test-*` di .gitignore; konsisten dgn test script lain).

## Remaining
- **Browser smoke test**: Chrome tidak tersedia di workspace ini — verifikasi visual tooltip, floating controls, dan long-press di HP/desktop oleh user belum dilakukan.
- **Rotate leaked password** dari `sogo_test.py` (historis) + optional `git filter-repo` history scrub.
- Migration portal sync flow (G-002.S-002) butuh test browser dengan credential asli.
