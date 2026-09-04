## 2026-09-03 — Fix tanggal SOGo Indonesia: email terbaru tenggelam di bawah daftar

- Root cause "email terbaru kok 28 Agustus": sortMessagesByDate (f152e84, deploy 28 Agu) mengurutkan by parsed date, tapi RelativeDate SOGo locale Indonesia ("Hari ini 09:41", "Kamis 12:36", "28/08/2026") tak terbaca Date.parse → ts=-Infinity → pesan ≤1 minggu tenggelam; "dd/mm/yyyy" lama salah-parse month-first dan mengapung di atas. Deploy & koneksi terverifikasi baik — ini bug parsing murni.
- Fix: parseIndoRelativeDate di src/lib/dateGroups.js + tiebreak uid numerik; 16 assertion baru di scripts/test-date-groups.mjs; 75/75 regression PASS, build PASS.
- Delivery: commit 116ccb9 di-deploy ke produksi (SERVER=deploy-mail ./deploy.sh, 2026-09-03); chunk tersaji produksi terverifikasi memuat parser baru. Push GitLab tetap menunggu tunnel wg0.

## 2026-09-02 — Cross-tab sync domain 'mail'

- Scope: multi-tab webmail — mutasi mailbox di tab A (delete/move/flag/read/junk/folder/kirim) kini memicu invalidate + refetch di tab B. Bump versi dipasang di layer api.js (bumpMailVersion setelah mutasi sukses); MailPage memasang watchDomainVersion('mail') → invalidate messages/unseen/folders.
- Validation: scripts/test-mail-crosstab.mjs baru (bump/scope/watcher/fail-no-bump), 75/75 regression PASS, vite build PASS.
- Delivery: commit 4a1e606 di-deploy ke produksi via SERVER=deploy-mail ./deploy.sh (2026-09-02): webmail HTTP 200, /api/health 200 end-to-end, image-proxy SSRF 403 OK, backend unchanged (skip restart). Push GitLab tetap ditunda sampai tunnel wg0 hidup (31 commit lokal menunggu).

## 2026-09-02 — Mail auto-refresh fix (T-MAIL-REFRESH-2026-09-02)

- Root cause "webmail tidak menampilkan email terbaru": query `messages` tidak punya refetch otomatis (badge unseen saja yang poll 60s; `refetchOnWindowFocus: false` global di App.jsx). Email baru hanya muncul setelah ganti folder / pull-to-refresh.
- Fix di src/pages/MailPage.jsx: (1) `refetchOnWindowFocus: true` khusus query messages; (2) invalidate `['messages', token, 'folderINBOX']` (refetchType 'active') saat unseenCount naik antar poll; (3) extraMessages hasil infinite-scroll kini divalidasi terhadap `uids` fresh dari SOGo saat refetch — mencegah list loncat balik ke 50 email pertama; search aktif tidak diganggu.
- Validation: 74/74 regression scripts PASS, vite build PASS.
- Delivery: commit 3062618 di-deploy ke produksi via SERVER=deploy-mail ./deploy.sh (tanpa push); smoke test webmail 200, /api/health 200, image-proxy SSRF 403 OK. GitLab push ditunda sampai tunnel wg0 hidup (29 commit lokal menunggu, termasuk fix ini).

## 2026-08-28 — Delivery R3

- Scope: ai-toolkit documentation reconciliation and delivery metadata; no speculative application changes.
- Updated current task risk/validation plan and corrected the accessibility regression assertion to match the current conversation import and overflow-safe toolbar contract.
- Validation: full script suite rerun after the assertion correction, Vite build PASS, npm production audit PASS, backend/deploy syntax PASS, and diff check PASS.
- Delivery: commit/push/deploy status is recorded after the commands complete; no secrets are included.

## 2026-08-28T10:34:48Z
- Status: COMPLETED
- Objective: T-DELIVERY-2026-08-28-R3: update ai-toolkit documentation, commit, push, deploy
- Summary: Delivery R3: ai-toolkit documentation reconciled, commit 612d63a created, production deploy and smoke checks passed; git push remains unconfirmed because remote timed out.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-09-02T14:37:06Z
- Status: COMPLETED
- Objective: T-MAIL-REFRESH-2026-09-02: webmail selalu menampilkan email terbaru (auto-refresh list)
- Summary: Webmail auto-refresh: query messages kini refetchOnWindowFocus + invalidated saat unseenCount naik (poll 60s); extraMessages lazy-load divalidasi terhadap uids fresh SOGo agar list tidak loncat. 74/74 regression PASS, build PASS. Push tertahan: tunnel wg0 ke GitLab down.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M src/pages/MailPage.jsx

## 2026-09-03T14:53:58Z — Audit fitur Calendar + E2E produksi: 2 bug fix
- Status: COMPLETED & DEPLOYED
- Scope: analisa fitur-per-fitur CalendarPage (3 view, navigasi, CRUD, recurrence scope single/all, drag&drop, prefs first-day, crossTab) + audit keamanan + E2E via replika request SPA di produksi (diag2).
- BUG 1 (kritis): eventsblocks SOGo 5.12 kirim baris di `events` bukan `blocks` → kalender SELALU kosong. Fix parser terima keduanya (6c8f731).
- BUG 2: recid sudah berprefix `occurence…` → prefix ganda → edit/hapus SATU occurrence selalu 404. Fix occurrenceSegment idempotent + parser pertahankan string.
- E2E lain PASS: create/edit/view/delete event, delete satu occurrence (204), delete seri, IDOR GUID acak 404, negative end<start diterima server (validasi UI wajib).
- Keamanan: render aman (React, tanpa innerHTML), auth cookie httpOnly + XSRF, tidak ada cross-user leak. 76/76 regression PASS, deploy hijau, chunk terverifikasi.

## 2026-09-03T14:10:00Z — Backlog drafts crossTab + audit path lengkap
- Status: COMPLETED & DEPLOYED
- Audit semua endpoint ber-parameter folder di api.js: hanya moveMessages yang kirim destination di body (sudah di-fix c320f20); createFolder/deleteFolder/view/headers/batchDelete/junk/compose aman (URL /Mail/0/{folderId}).
- Backlog #2 selesai: saveDraft/deleteDraft kini men-bump versi crossTab 'mail' (commit 6ca0b6c) — folder Drafts ikut sync antar tab; bump hanya setelah sukses. test-mail-crosstab diperluas (drafts bump + gagal tidak bump). 76/76 regression PASS, build PASS, deploy hijau, served chunk terverifikasi (n.ok&&bump).
- next-tasks.md diregenerasi (backlog draft done; push 42 commits menunggu wg0 stabil).

## 2026-09-03T13:40:00Z — Verifikasi replay alur aturan + audit path + status push
- Status: COMPLETED (push masih tertunda)
- Audit path SOGo: hanya moveMessages yang memakai destination-di-body — createFolder/deleteFolder/view/headers/batchDelete/junk aman (semua lewat URL /Mail/0/{folderId}, segmen akun sudah benar).
- Replay alur aturan end-to-end via diag2: seed 2 pesan → createFolder (204) → moveMessages 2 uid ke /0/folderINBOX/folderMvTest (200) → doveadm konfirmasi fisik: pesan pindah ke INBOX/MvTest, uid lain tetap di INBOX. Cleanup selesai (folder dihapus, diag2 di-disable).
- Push GitLab: wg0 flapping — fetch sempat sukses, lalu peer dead (ping 100% loss, TCP443 timeout), push timeout di 135s. Local main AHEAD 40 commit. Push ulang saat tunnel kantor stabil.

## 2026-09-03T13:17:54Z — Fix 500 "Cannot copy messages to other account" pada semua move
- Status: COMPLETED & DEPLOYED
- Objective: user dapat 500 saat run aturan (RulesPage) — "Cannot copy messages to other account"
- Akar masalah: moveMessages SPA mengirim destination `folder` = /{email}/folderX; SOGo membandingkan segmen pertama dengan nameInContainer akun sumber ("0") → dianggap cross-account → 500. Semua jalur move terdampak (rules engine, run manual, drag&drop, archive, quick move, move-to-trash via moveMessages).
- Fix: toSogoAbsPath kembali "' + '/' + '0/'" + cssId (src/lib/api.js) + test scripts/test-move-path.mjs; bukti live di server: format email → 500 persis, format 0 → 200 + pesan pindah folder.
- Validasi: 76/76 regression PASS, build PASS, commit c320f20, deploy hijau, served chunk terverifikasi memuat "return`/0/`+t.split".
- Catatan: diag2 dipakai untuk eksperimen (password doveadm-hash, login 200) lalu di-disable kembali; folder MvTest dihapus.
- Changed Files: src/lib/api.js, scripts/test-move-path.mjs, docs/ai/*

## 2026-09-03T16:05:00Z — Audit fitur Mail /webmail/mail + E2E produksi + fix junk
- Status: COMPLETED & DEPLOYED
- Objective: analisa fitur/fungsi halaman mail satu per satu, audit + e2e test, cari bug & vulnerability.
- Pemetaan fitur: list+pagination server-side (/view prefetch ~100 + /headers lazy), search (filters SOGo), read+auto markRead, reply/forward/quick-reply, compose+draft autosave, attach restore, junk/ham, rules engine, folders CRUD, snooze, crossTab, keyboard shortcuts, phishing banner, image proxy anti-tracking.
- E2E produksi (diag2): login 200; folders 200 (7 mailbox); INBOX/Drafts/Junk view 200; compose 201; saveDraft 200 (+uid); batchDelete 200; createFolder/deleteFolder 204; search filters 200; moveMessages /0/... 200 + fisik pindah (doveadm); negative legacy destination → 500 persis "Cannot copy messages to other account".
- BUG #3 ditemukan & fixed (commit 07a82cd, LIVE): Lapor Spam hanya POST markMessagesAsJunk (204) tanpa memindahkan pesan — pesan tetap di INBOX. Flow native SOGo = laporan + moveMessages → folderJunk. Sekarang SPA mereplikasi itu; notjunk dari Junk → INBOX. Test baru scripts/test-junk-move.mjs (6 assertion).
- Audit keamanan: XSS terkendali (DOMPurify 3 lapis: render email, editor compose, chokepoint sendMessage; hardening hook anti-tabnabbing + data: URI); SSRF image-proxy guarded (DNS pinning, blokir IP privat, hard deadline, size cap, Sec-Fetch-Site anti-hotlink); IDOR/traversal 404; auth XSRF+XMLHttpRequest wajib; search query di-cap 500 char.
- Catatan: markMessagesAsNotJunk tidak dipakai UI → tree-shaken (benar); jika suara "Tidak Spam" dibutuhkan, impor dari api.js.
- Regression: 77/77 PASS (tambah 1 file test), build PASS, deploy hijau, served chunk api-DEoJTmwF.js terverifikasi mengandung flow junk baru.
- Cleanup: semua pesan uji dihapus, diag2 di-disable kembali.

## 2026-09-04 — Fitur "Bukan Spam" (commit 367f0d6, LIVE)
- Tombol "Bukan Spam" (ShieldCheck, emerald) di toolbar bulk MailPage + reader MessageReader, hanya muncul di folder Junk; shortcut `!` di Junk kini un-junk (kembali INBOX) alih-alih junk.
- Flow: POST markMessagesAsNotJunk (laporan best-effort) → moveMessages ke folderINBOX — replikasi flow native SOGo, sama seperti fix Lapor Spam (07a82cd).
- Validasi: regression 77/77 PASS, build PASS, deploy hijau; served chunk api-COycyjie.js + MailPage-DYEIUpHb.js terverifikasi berisi fitur.
- GitLab push masih tertunda (tunnel wg0 flapping) — local main ahead; push manual `git push origin main` saat tunnel stabil.

## 2026-09-04 — Aksi per-baris "Bukan Spam" (commit 3923f69, LIVE)
- Hover action ShieldCheck pada row pesan di folder Junk (pola cluster hover Gmail-like, gate `folderJunk && !isTouch`) → notJunkMutation per uid → laporan + moveMessages ke INBOX.
- Regression 77/77 PASS, build PASS, deploy hijau, served chunk terverifikasi.

## 2026-09-04 — E2E "Bukan Spam" sukses penuh (produksi, diag2)
- Chain terverifikasi: login 200 → seed ham ke Junk → markMessagesAsNotJunk 204 → moveMessages /0/folderINBOX 200 → doveadm: Junk kosong, INBOX berisi pesan. Negative test dari INBOX: 204 tanpa move. Cleanup 0 sisa.
- Bonus diagnosis: 403 login diag kemarin = salah format payload diagnostik (harus JSON `userName`, bukan form) + baris static view mailbox baru tak auto-insert. Bukan bug produksi; tidak ada user terdampak (login user real normal sepanjang waktu).
- Config change: blok debug sogo.conf dimatikan (verbose log IMAP sejak 27 Aug). Backup: /etc/sogo/sogo.conf.bak-debug-on.
- diag3@pcpexpress.co.id dibuat (disabled) sebagai diag account cadangan; diag2 tetap disabled.

## 2026-09-04 — Cleanup akun diag selesai
- diag3@pcpexpress.co.id: ternyata sudah terhapus bersih (sesi sebelumnya) — audit 9 lapisan (mailbox, alias, quota2, static view, sogo_users/cache/folder_info/alarms, maildir, doveadm) semuanya 0.
- Bonus: menemukan & menghapus **diagx@pcpexpress.co.id** (sisa test mailbox "Diag Test" dari sesi debug moveMessages 3 Sep; disabled, tanpa maildir). Dihapus via mailcow API → cascade bersih (mailbox/alias/quota2 = 0). Tidak ada residual SOGo table.
- Sisa akun diag: hanya **diag2@pcpexpress.co.id** (disabled) — dipertahankan sebagai akun diag utama untuk E2E.
- Catatan infra: nama container mailcow kini berprefix `mailcow-` (mis. `mailcow-dovecot-mailcow-1`), jangan hardcode `dovecot-mailcow` lama.

## 2026-09-04 — Fix: email terbaru "hilang" dari atas daftar (sort by date)
- Laporan user (anas.fikri@pcpexpress.com): filter unread menampilkan email jam 10:38, tanpa filter email teratas malah "Kemarin 21:38".
- Akar masalah: parser RelativeDate SPA hanya mengenal format Indonesia; SOGo merender email hari ini sebagai waktu polos ("10:38", TANPA "Today") dan nama hari English penuh ("Thursday 08:55") untuk locale English (profil anas.fikri SOGoLanguage=English) → ts=-Infinity → tenggelam di sort date-desc. Dibuktikan dari source SOGo 5.12 UIxMailListActions.m + uji parser Node + doveadm (email hari ini ada di INBOX).
- Fix: parseMessageDate ditambah cabang waktu-polos=hari-ini (regex strict full-string), nama hari English penuh, AM/PM defensif; conversations.js ts() memakai parser yang sama (bug sekunder: preview thread salah pilih pesan terbaru). Commit f0b1d7b, regression 77/77, deploy terverifikasi (chunk MailPage-CMTXJ2bb.js memuat sunday..saturday + regex time-only).

## 2026-09-04 — Investigasi & fix ratelimit 4.7.1 "mailcow" exceeded
- Keluhan user: error 4.7.1 saat kirim dari webmail. Terbukti di postfix: 8 milter-reject (4 alfian @09:26, 4 nazwa @10:03–10:17), semua dari SOGo.
- Akar masalah: bucket ratelimit per-user dihitung PER-PENERIMA (bincpt=nrcpt di plugin rspamd) — 6 email × banyak penerima = 93 penerima/17 menit > burst 100/1h. "mailcow" di pesan error = nama handler custom keyword, bukan bucket bersama.
- Fix dieksekusi (disetujui user): RL_VALUE Redis 100/1h → 300/1h untuk 714 user. Custom limit lain dipertahankan (10/1m alim/innaka, 200/1h anas.fikri). Berlaku seketika, tanpa restart. Tidak ada pesan hilang (soft reject).

## 2026-09-04 — Sort email terverifikasi + auto-reload tab basi setelah deploy
- Verifikasi E2E data produksi: RelativeDate asli `"13:36"` (email hari ini,
  English locale) ter-parse & ter-sort benar oleh bundle terdeploy.
- Fitur baru: deploy-check otomatis (`deployCheck.js` + vite
  `build-version-stamp` + `DeployWatcher` di App.jsx) — tab lama reload sendiri
  ≤5 menit setelah deploy baru, tanpa aksi user. Test: `scripts/test-deploy-check.mjs`
  (suite penuh 78/78 pass). Sudah live di produksi.

## 2026-09-04 — Golden-sample retest /webmail/mail: 2 fix + test permanen
- Capture data produksi asli (diag2): list/detail/folders → fixture permanen
  `scripts/fixtures/mail-golden-*.json` + resep `scripts/capture-mail-golden.sh`.
- Test baru `scripts/test-mail-golden.mjs` (replay seluruh parser/formatter
  MailPage lewat data asli; 40+ assertion). Suite 79/79 PASS.
- Fix #1: renderDate gagal parse "…14:24 WIB" (NaN → string mentah tampil).
- Fix #2: lampiran sub-KB tampil "0 KB" → kini "144 B".
- Deployed & verified live; tab terbuka auto-reload via deploy-check.

## 2026-09-04 — Golden-sample Calendar/Contacts: fix data loss createContact
- Bug kritis: createContact lama (_new_/saveAsContact) → 200 tapi kartu tak
  tersimpan (phantom draft). Fix = flow UI SOGo (newguid → {guid}/saveAsContact,
  emails/phones array). E2E produksi ✅ tersimpan.
- Bug #2: parseCalendarEvents c_partmails array (bukan string newline) — fixed.
- Fixture: contacts-golden-view.json, calendar-golden-eventsblocks.json,
  calendar-golden-event-detail.json + resep capture-calendar-contacts-golden.sh.
- Test baru test-calendar-contacts-golden.mjs; kontrak createContact di
  test-a11y.mjs direvisi. Suite 80/80 PASS. Deployed & live-verified.

## 2026-09-04 — Browser E2E create contact (Puppeteer, produksi)
- Test: scripts/e2e-contact-browser.mjs — login UI → Contacts → Tambah →
  Simpan → muncul di daftar → persist setelah reload penuh → cleanup via UI.
  2x run PASS. Menutup lingkaran regresi bug data loss createContact.
- Infra: Chrome deps user-space (~/.local/chrome-libs, tanpa sudo) +
  findChrome()/ensureChromeLibs() reusable. diag2 harus aktif sebelum run.

## 2026-09-04 — Browser E2E create event kalender (Puppeteer, produksi)
- Test: scripts/e2e-calendar-browser.mjs — login UI → Calendar → klik "+" di
  sel hari ini → modal Event Baru (tanggal pre-filled) → isi Judul → Buat
  Event → muncul di grid → persist setelah reload penuh → cleanup via API
  session browser (eventsblocks → delete by c_name, retry anti-500-transien).
- Idempoten: pre-cleanup otomatis menghapus event uji lama di awal run
  (2 run berturut-turut PASS); XSRF-TOKEN dari cookie wajib di header fetch
  page-context (tanpa itu eventsblocks/delete → 500).
- Catatan: cleanup via klik grid event tidak reliable (chip nested; slice(0,3)
  di sel bisa menelan event uji) — pakai jalur API.
- Suite unit tetap 80/80 PASS; diag2 disabled kembali setelah E2E.

## 2026-09-04 — Browser E2E mail flow (Puppeteer, produksi)
- Test: scripts/e2e-mail-browser.mjs — login UI → Tulis Pesan → To=diri sendiri
  (MultiEmailInput + Enter commit chip) → subjek unik + body → Kirim → poll
  kedatangan di INBOX → asersi SORT: subjek uji DI ATAS email "Yesterday"
  (pembanding di-seed via doveadm dengan Date kemarin 21:38 — RelativeDate
  "Yesterday 21:38") → reload penuh: persist + sort stabil → cleanup
  batchDelete. Pre-cleanup email uji lama = idempoten.
- Regresi langsung bug RelativeDate ("13:36" tenggelam di bawah email lama).
- Suite unit tetap 80/80; diag2 dibersihkan & disabled setelah E2E.
