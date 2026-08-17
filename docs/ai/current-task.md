# Current Task

Status: COMPLETE — Round 9 sidebar folder tree expand/collapse (deployed LIVE)
Task ID: sogo-tree-2026-08-17-r9
Started At: 2026-08-17
Updated At: 2026-08-17
Project Root: /Users/anasfikri/Documents/Projects/pcpexpress/mailcow/sogo-frontend

## Round 9 (terbaru) — sidebar folder expand/collapse
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
