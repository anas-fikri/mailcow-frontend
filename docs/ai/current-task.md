# Current Task

Status: COMPLETE — Round 5 bug hunt: subject object crash (multi-site), formatAddresses undefined, debug UI Vacation, signature sync RichEditor, dompurify bump
Task ID: sogo-bug-hunt-2026-08-17
Started At: 2026-08-17
Updated At: 2026-08-17
Project Root: /home/anas.fikri/mailcow-frontend

## Round 5 bug hunt — 5 fixes (detail: `docs/ai/handoff.md` teratas)

- [x] **HIGH** subject object crash: `messageRows.js` String() normalize (root cause) + guard di `api.js` search filter, `stats.js` countBounces, `MessageReader` (subject/startsWith/handlePrint), `MailPage` render.
- [x] **MEDIUM** MessageReader `formatAddresses` item string → "undefined".
- [x] **LOW** PreferencesPage VacationSection debug UI `[debugVal]` dihapus.
- [x] **LOW-MED** ComposeModal RichEditor dirty-tracked hydrate — signature tampil di compose reply; konten lama tidak nyangkut saat modal dibuka ulang.
- [x] **SECURITY** dompurify 3.4.12→3.4.13 (GHSA-55q2-fjhq-7xh7) — `npm audit` 0 vulnerabilities.
- [x] Validation: 11/11 test PASS (tambah case subject object), build ✅, node --check ✅, bash -n ✅.


## Objective
UI batch: avatar inisial di daftar email, header percakapan, dan panel baca (MessageReader); tooltip custom; refactor checkbox & star jadi floating overlay di atas avatar (hemat ~52px/baris) dengan long-press untuk seleksi di mobile; unit test untuk logika avatar; perbaiki test login-flow yang stale. **COMPLETE — LIVE di production.**

## Deliverables

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
- **Semua 11 test PASS**: safe-url, user-prefs, path-segment, message-totals, message-rows, message-requests, message-api, nginx-routes, login-diagnostics, login-flow, initials.
- `npx vite build` ✅ bersih.
- Code review (tooltip positioning, long-press race, floating overlay) — 2 bug ditemukan & diperbaiki: long-hold deselect + tombol tersembunyi tetap focusable.

## Git / Deployment
- Commit fitur + test + docs dipush ke `origin/main` dan **deploy LIVE** via `DEPLOY_SSH_HOST=deploy-mail ./deploy.sh` (preflight SOGo ✅, build ✅, rsync ✅, nginx reload ✅, webmail HTTP 200 ✅, asset hash terverifikasi).
- `scripts/test-initials.mjs` butuh `git add -f` (pattern `test-*` di .gitignore; konsisten dgn test script lain).

## Remaining
- **Browser smoke test**: Chrome tidak tersedia di workspace ini — verifikasi visual tooltip, floating controls, dan long-press di HP/desktop oleh user belum dilakukan.
- **Rotate leaked password** dari `sogo_test.py` (historis) + optional `git filter-repo` history scrub.
- Migration portal sync flow (G-002.S-002) butuh test browser dengan credential asli.
