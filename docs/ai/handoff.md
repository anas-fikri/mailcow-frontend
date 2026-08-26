# Handoff Log

## 2026-08-19 — Security batch 2 (smtpToken cookie + paste-XSS + DoS test) — DONE + DEPLOYED

- **smtpToken → cookie httpOnly (`482df26`):** sesi SMTP kini cookie `smtp_session` (HttpOnly+SameSite=Strict+Path=/api+Secure+Max-Age=TTL) — XSS tak bisa baca token. Server `getSmtpSessionToken()` baca cookie → header → body (fallback deploy bertahap). Frontend tak lagi simpan/kirim token (`credentials:'include'`). Helper murni `src/lib/smtpCookie.js` + `test:smtp-cookie`. CSRF: SameSite=Strict + X-Api-Key.
- **Paste-XSS + anti tabnabbing (`fc86032`):** hook DOMPurify `afterSanitizeAttributes` = `hardenAnchorNode` (pasteUtils.js) — hapus `data:` href pada `<a>` + paksa `rel=noopener noreferrer` pada `<a target=_blank>`. Berlaku render email + editor. `test:purify-hardening`. Catatan: DOMPurify tak bisa jalan di Node/linkedom (linkedom tanpa `document.implementation`) → test murni ke logic hook.
- **DoS slow-drip test (`3cd39af`):** fetch image proxy di-extract ke `src/lib/remoteImage.js` (injectable timeout/maxBytes/maxRedirects/resolve). Test slow-drip → hard deadline 504 <3s. Bonus fix: branch `remaining<=0` di `requestImageOnce` dulu destroy res tanpa settle promise (hang) → reject 504. `test:remote-image`. server.js import fetchRemoteImage; import dns/http/https/isBlockedIp dihapus.
- **deploy.sh `BACKEND_LIB_FILES`** kini: ssrfGuard, emailValidation, smtpCookie, remoteImage.
- **Validasi:** 28/28 test PASS, build OK, npm audit 0 vuln. Deploy LIVE: webmail HTTP 200, SSRF 403, proxy gambar 200, sogo-smtp-proxy active/running.

## 2026-08-19 — server.js audit: rate-limit & session hardening — DONE (siap deploy)

- **Permintaan user:** audit ulang `server.js` (proxy SMTP) untuk rate-limit dan session hardening.
- **Input validation (HEADER INJECTION):** validasi email sebelumnya hanya menolak `\r\n` — lone `\n`/`\0`/control char lain lolos. Sekarang `isSafeEmail`/`isSafeRecipient`/`hasControlChars` menolak SEMUA karakter kontrol (0x00–0x1F + DEL). Di-extract ke `src/lib/emailValidation.js` (pure) + `test:email-validation`. Subject `/api/send` ikut pakai `hasControlChars`.
- **Rate limit:** respons 429 kini kirim header `Retry-After`. `clientIp` bisa diketatkan via `TRUSTED_PROXY_IPS` (koma, exact IP) — fallback tetap loopback + 172.16/12.
- **Session:** TTL/idle/cap per-user kini configurable via env `SMTP_SESSION_TTL_MIN` (480) / `SMTP_SESSION_IDLE_MIN` (30) / `SMTP_SESSION_MAX_PER_USER` (10) + evict session tertua per user (cegah Map tumbuh tanpa batas).
- **Headers `/api/*`:** tambah `Referrer-Policy` + `Permissions-Policy` (konsisten dgn nginx).
- **Risiko diterima (dokumentasi):** password plaintext di memori 8 jam (nodemailer butuh kredensial); smtpToken di localStorage bisa dicuri XSS — dimitigasi TTL pendek + rate limit kirim per IP.
- **Validasi:** build OK, 24/24 test PASS, `node --check server.js` OK. BELUM deploy.

## 2026-08-19 — Remote image proxy (anti tracking-pixel, pola Gmail) — DONE (siap deploy)

- **Permintaan user:** tambah proxy gambar remote seperti Gmail agar IP user tidak bocor ke pengirim (tracking pixel 1x1 / read-receipt) saat render email.
- **Backend (`server.js`):** endpoint baru `GET /api/image-proxy?url=...` — didefinisikan SEBELUM `app.use('/api', requireApiKey)` karena `<img>` tak bisa kirim header X-Api-Key. Keamanan: (1) SSRF guard `src/lib/ssrfGuard.js` — blokir IPv4/IPv6 privat/loopback/link-local/reserved/multicast (fail-closed), (2) resolve DNS sekali lalu PIN koneksi ke IP tervalidasi (cegah DNS rebinding via `lookup` kustom), (3) redirect dibatasi 3 hop + re-validasi tiap hop, (4) content-type wajib image/*, (5) batas 5MB + timeout 10s, (6) rate limit 120/menit/IP, (7) `Sec-Fetch-Site: cross-site` ditolak (anti-hotlink).
- **Frontend (`src/lib/imageProxy.js` + `MessageReader.jsx`):** `proxyExternalImages(cleanHtml)` rewrite `<img src="http(s)://...">` → `/api/image-proxy?url=...` HANYA untuk tampilan (`displayHtml`). `cleanHtml` tetap dipakai untuk quote balasan/forward & print (URL asli — valid untuk penerima email).
- **Nginx:** route `location = /api/image-proxy` → 3005; CSP `img-src 'self' data: https:` → `img-src 'self' data:` (fail-closed: gambar eksternal yang tak ter-proxy tidak akan load).
- **Validasi:** build OK (2.73s), 23/23 test PASS (baru `test:ssrf-guard` + `test:image-proxy`), `node --check server.js` OK. BELUM deploy — butuh restart `sogo-smtp-proxy` + nginx reload.
- **Catatan:** belum mencakup `srcset`/`<picture><source>`/CSS `background-image` — tapi CSP img-src yang diketatkan memblokir vektor itu (fail-closed: gambar tak tampil daripada bocor). Bisa ditambah nanti.

## 2026-08-19 — 3 fitur: spam native SOGo + fix lampiran + subfolder UI — DONE (siap deploy)

- **Permintaan user:** (1) tombol mark as SPAM per-message, (2) lampiran yang tidak muncul, (3) buat/hapus subfolder di sidebar.
- **Fitur 1 — Laporkan Spam native (`markMessagesAsJunk`):** SOGo punya endpoint native `POST /Mail/0/{folder}/markMessagesAsJunk` body `{"uids":[int]}` → 204 (dari `UIxMailFolderActions.m` — source master diverifikasi == deployed bundle checksum `372f2e21`/`aa1f7a75`, build `@localhost 20260611`). Lebih benar daripada move manual: SOGo set flag Junk + pindah sekaligus → klasifikasi spam Rspamd tetap jalan. Endpoint tambahan: `markMessagesAsNotJunk` (kebalikan).
  - `api.js`: `normalizeUids()` helper (int, filter invalid) + 2 fungsi (pola `moveMessages`: `pathSegment` + `allowEncodedSlash`, `sogoHeaders`, error body capture).
  - `MessageReader.jsx`: tombol AlertTriangle di toolbar setelah Hapus, hidden saat `folder === 'folderJunk'`, `spamMutation` → toast + invalidate messages/unseen + navigateAfter.
  - `MailPage.jsx`: bulk spam button (baris ~1500) DAN shortcut `'!'` (baris ~856) di-upgrade dari `moveMutation → junkFolder` ke `junkMutation` native. `junkFolder` var kini unused → dihapus.
- **Fitur 2 — Lampiran tidak muncul:** ROOT CAUSE teridentifikasi dari source `UIxMailPartViewer.m renderedPart`: SOGo bisa kirim `parts` sebagai **ARRAY langsung** (bukan object `{type, content:[...]}`). `extractAttachments`/`extractInlineImages`/`extractHtml` cek `parts.contentType` pada array → undefined → return [] → lampiran tidak pernah tampil. Fix: tambah guard `Array.isArray(parts)` di TOP semua extract function (rekursi tiap elemen). Juga: `size` dari SOGo = **STRING terformat** ("1.2 MB"), bukan bytes → `formatFileSize` NaN → fix tampilkan string langsung. Fix defensif tambahan: fallback `downloadURL || viewURL`, skip part teks (html/plain) dari lampiran.
- **Fitur 3 — Subfolder:** `createFolder` = `POST /Mail/0/{parentFolder}/createFolder` body `{"name"}` → 204/500 `{message}`; `deleteFolder` = `POST /Mail/0/{folder}/delete` body `{"withoutTrash":true}` → 204 (permanen). MailPage: tombol `FolderPlus` (buat subfolder) + `Trash2` (hapus, non-default only via `DEFAULT_FOLDERS`) per baris folder, muncul saat hover/touch; modal create (input nama) + delete (konfirmasi permanen). `deleteFolderMutation` reset ke folderINBOX bila folder aktif/di dalamnya dihapus. Invalidate `['folders', sogoToken]` setelah create/delete.
- **Validasi:** build OK (844ms), test:message-html / test:mailbox-tree / test:path-segment PASS. BELUM deploy — live verify terblokir (kredensial stale: 403 LDAPPasswordPolicyError 65535).
- **Catatan:** verifikasi live response SOGo masih pending (butuh kredensial test segar). Implementasi defensive mengikuti ground truth source SOGo (deployed == master).
## 2026-08-18 — moveMessages UIDs normalization + error body capture — DONE + DEPLOYED

- **Bug:** `moveMessages` mengirim UIDs apa adanya dari `parseMessageRow` — bisa berupa string dari JSON response SOGo. SOGo backend expect `uids` sebagai array integer → 500 error saat auto-archive rule jalan.
- **Fix:** Tambahkan `parseInt` normalization di `moveMessages`: semua UID dikonversi ke integer via `parseInt(String(u), 10)`. Invalid UIDs (NaN/<=0) di-filter + console.warn. Kalau semua UIDs invalid, throw explicit error.
- **Improvement:** Tangkap response body saat error 500 (`await res.text()`) — sebelumnya hanya throw generic "Gagal memindahkan pesan (500)" tanpa detail. Sekarang error message include first 200 char dari SOGo response body.
- **Pelajaran:** SOGo JSON API kirim UIDs sebagai number, tapi parseMessageRow tidak convert ke integer secara eksplisit. Selalu normalize data dari API ke tipe yang diharapkan server sebelum kirim balik.
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit ef340e0, HTTP 200).

## 2026-08-18 — React #310 ROOT CAUSE: useRef after early return — DONE + DEPLOYED

- **ROOT CAUSE:** `contactNameRef`, `contactEmailRef`, `contactPhoneRef` (3x `React.useRef`) dideklarasikan di BARIS 516-518, SETELAH early return `if (!msgId) return null;` di baris 337. React melihat jumlah hook BERBEDA antara render (render pertama: 6 useState + 2 useQuery + 3 useRef + 3 useEffect + 3 useMutation = 17 hooks; render kedua tanpa msgId: 6 useState + 2 useQuery + 1 useRef + 3 useEffect + 3 useMutation = 15 hooks) → Rules of Hooks violation → React #310.
- **Stack trace analysis:** `st@MailPage:1:9154` = MessageReader; `useRef` di stack = contactRef yang dipanggil secara conditional; `nn@MailPage:26:27724` = MailPage (parent).
- **Fix:** Pindah `contactNameRef`, `contactEmailRef`, `contactPhoneRef` ke baris 216-220 (SEBELUM semua conditional returns) — bersama `markReadFired`.
- **Pelajaran:** SEMUA hooks (useState/useRef/useEffect/useQuery/useMutation) WAJIB dipanggil di URUTAN yang SAMA di setiap render — tidak boleh ada di dalam conditional, setelah early return, atau di dalam loop.
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit fcbbf93, bundle MailPage-DvnK3tH3.js).

## 2026-08-18 — React #310 persistent: markRead ref guard — DONE + DEPLOYED

- **Gejala:** React error #310 masih muncul meskipun markRead sudah dipindah dari queryFn ke useEffect.
- **Root cause:** markRead useEffect fires pada setiap render karena deps `[msg?.uid]` berubah saat React Query return data baru (refetch dari invalidateQueries). Setiap fire → invalidateQueries → parent re-render → component re-render → effect fire lagi → loop.
- **Fix:** Tambah ref guard `markReadFired` — markRead hanya fire 1x per mount. Ref di-reset saat component unmount (implicit: ref hilang saat component unmount).
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit bac4542, bundle MailPage-BJ_MUnUD.js).

## 2026-08-18 — React #310 root cause: markRead in queryFn cascading invalidation — DONE + DEPLOYED

- **Gejala production:** React error #310 (Maximum update depth exceeded) — infinite re-render loop di MessageReader (bukan MailPage).
- **Root cause SEBENARNYA:** `queryFn` di MessageReader `useQuery` memanggil `markRead()` yang trigger `queryClient.invalidateQueries(['messages', ...])` → MailPage re-render → MessageReader re-render → query run lagi → `markRead` lagi → infinite loop.
- **Analisa:** Komponen `ot` di stack trace = MessageReader (bukan MailPage). Bundle `MailPage-CWkArTw9.js` = versi LAMA (browser cache). Bundle baru `MailPage-DZ-tVu2G.js` sudah ter-deploy.
- **Fix:** Pindah `markRead` dari `queryFn` ke `useEffect` terpisah dengan deps stabil `[msg?.uid, user?.sogoToken, folder, msgId]`. QueryFn sekarang hanya `fetchMessage` — tidak ada side effect.
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit 2d67bbf).

## 2026-08-18 — Bug hunt round 2: React #310 fix + cleanup — DONE + DEPLOYED

- **Gejala production:** React error #310 (Maximum update depth exceeded) — infinite re-render loop di MailPage.
- **Root cause (partial fix):** focusIdx clamp effect punya `focusIdx` di dependency array → bisa berinteraksi dgn reset effect.
- **Fix:** Hapus `focusIdx` dari dependency array clamp effect. Tambah `Math.max(0, ...)` utk handle `messages.length = 0`.
- **Additional cleanup:** pruneExpired comment dipermudah, verified semua effects punya cleanup, verified tidak ada side effect di useMemo.
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit 1ec9207).

## 2026-08-18 — fetchMessage retry + MessageReader error UI — DONE + DEPLOYED

- **Gejala production:** buka email → "Terjadi Kesalahan" (ErrorBoundary crash) → refresh baru bisa. Juga local dev SOGo 500 through Vite proxy.
- **Root cause:** `fetchMessage` tidak punya retry → transient SOGo 500 langsung throw → ErrorBoundary tangkap → error page scary. React Query default retry 3x tapi tetap gagal kalau SOGo lagi sibuk.
- **Fix #1 — `api.js` fetchMessage retry:** retry 2x dengan delay 300ms/600ms saat SOGo return 500. Juga retry network errors (no status).
- **Fix #2 — MessageReader error UI:** handle `msgError` dari React Query secara internal — tampilkan UI error yang user-friendly (Ikon AlertCircle + "Gagal memuat pesan" + tombol "Coba Lagi" + "Kembali"). Error TIDAK lagi bubble ke ErrorBoundary → tidak ada scary page.
- **Fix #3 — React Query retry:** tambah `retry: 2, retryDelay: 500` di useQuery fetchMessage.
- **Validasi:** 20/20 test PASS, build OK, deploy LIVE (commit e8fe1d7).

## 2026-08-18 — Bug hunt loop (5 pass) + fix 7 bugs — DONE + DEPLOYED

- **Metode:** ai-toolkit bug hunt loop (5 pass: self-review, flow logic, edge case, cross-module, security).
- **Bug 1 — visibleCount not reset on folder change:** Saat user ganti folder, `visibleCount` tetap di nilai lama → jika folder baru punya pesan lebih sedikit, semua pesan langsung tampil (bukan PAGE_SIZE). Fix: tambah `setVisibleCount(PAGE_SIZE)` di useEffect `[selectedFolder, searchQuery]`.
- **Bug 2 — snoozedUids side effect in render:** `pruneExpired(user.email)` dipanggil di dalam `useMemo` → side effect saat render (menulis localStorage). Fix: pindah ke `useEffect` terpisah sebelum `useMemo`.
- **Bug 3 — focusIdx out-of-bounds:** Saat messages berubah (ganti folder, search), `focusIdx` bisa tetap di index lama → `messages[focusIdx]` = undefined → crash di keyboard handler. Fix: tambah `useEffect` clamp `focusIdx` ke `messages.length - 1`.
- **Bug 4 — quick reply tanpa recipient:** `handleQuickSend` tidak validasi `recipient` → kalau `replyTo` + `from` keduanya kosong, `sendMessage` dipanggil dengan `to: ''` → SOGo error. Fix: validasi `if (!recipient) toast.error()`.
- **Bug 5 — RulesPage toast tampilkan raw folder ID:** `handleRunNow` tampilkan `rule.actionFolder` (mis. `folderArchive`) saat `folderById` return null. Fix: `.replace(/^folder/, '')` utk human-readable label.
- **Bug 6 — executeRules silent error:** `.catch` hanya `console.warn` → user tidak tahu aturan gagal. Fix: tambah `toast.warning`.
- **Bug 7 — autoArchive body field selalu gagal:** SOGo list view TIDAK mengembalikan field `body` → kondisi berbasis body tidak pernah match. Fix: hapus `body` dari `RULE_FIELDS`.
- **Validasi:** build OK + **20/20 test PASS**.

## 2026-08-18 — Comprehensive bug audit + fix: RulesPage TDZ, addRule silent fail, folder path conversion — DONE + DEPLOYED

- **Permintaan user:** "nah tadi gue sempet bikin aturan dari kotak masuk, tapi ga ada di halmaan /webmail/rules. kayanya lo perlu cek lebih dalam kemungkinan bugs fitur lainnya deh"
- **Root cause #1 — RulesPage `handleRunNow` TDZ:** variabel `allFolders` + `handleRefresh` dideklarasikan SETELAH `handleRunNow` yang menggunakannya. Meskipun runtime closure capture by reference (no crash), ini fragile. Fix: pindah `allFolders`, `allFolders`, `refreshKey`, `rules`, `handleRefresh`, `folderById` SEBELUM `handleRunNow`.
- **Root cause #2 — QuickRule silent fail:** `addRule(userEmail, ...)` memanggil `saveRules(email, rules)` yang punya guard `if (!email) return;` → rule TIDAK disimpan ke localStorage tapi toast tetap tampilkan "Aturan dibuat". Fix: `addRule` throw Error jika `email` kosong; QuickRuleModal guard `if (!userEmail)` sebelum `addRule`.
- **Root cause #3 — handleRunNow pakai string folder ID:** `moveMessages(..., rule.actionFolder)` kirim string `folderArchive`. moveMessages convert `folderArchive` → `Archive` ✓ (sudah handle). Tapi fix: resolve via `folderById(rule.actionFolder)` → kirim object folder ke moveMessages (konsisten dengan pattern lain).
- **Fix files:** `src/pages/RulesPage.jsx` (reorder + folderById + targetFolder objek), `src/lib/autoArchive.js` (addRule guard), `src/components/mailer/QuickRuleModal.jsx` (userEmail guard).
- **Validasi:** build OK + 20/20 test PASS + deploy LIVE (commit 7f40e8c).

## 2026-08-18 — Batch 2 fitur harian: auto-advance, group by tanggal, tambah kontak, kalender UX, rule jalankan-now — DONE (siap deploy)

- **Permintaan user:** "tolong lanjutin" + pilihan: auto-advance setelah hapus/arsip, group by tanggal, tambah ke kontak dari email, + pertimbangkan kemudahan kalender & fleksibilitas rule.
- **Auto-advance (`src/components/mailer/MessageReader.jsx`):** prop `siblingUids` + `onNavigateTo`. `navigateAfter()` dipanggil di onSuccess delete (trash/permanen) & move → buka pesan berikutnya di daftar (`siblingUids[idx+1]`, fallback `idx-1`, lalu onClose). MailPage pass `siblingUids={visibleOrderUids}` + `onNavigateTo={(uid)=>setSelectedMsgId(uid)}`.
- **Group by tanggal (`src/lib/dateGroups.js` + `scripts/test-date-groups.mjs`, 32 kasus):** helper murni `parseMessageDate` (ISO/RFC/epoch/'today'/'yesterday'/garbage→null) + `getDateGroup` (0=Hari Ini, 1=Kemarin, 2-6=Minggu Ini, 7-29=Bulan Lalu, >=30/unparseable=Lebih Lama) + `groupMessagesByDate` (grup kontigu, urutan dipertahankan). Render di MailPage flat list (bukan conversation view): header sticky tipis per grup; `flatIdx` kontigu utk focus keyboard. `package.json` `test:date-groups`.
- **Tambah ke kontak (`MessageReader.jsx`):** tombol UserPlus di toolbar (muncul bila `contactPerson` ada) → modal prefill `contactPerson?.name/email` dari `msg.from[0]` (Terkirim/Draf: `msg.to[0]`) → `createContact` (`{c_cn, c_mail, c_telephonenumber}`) → toast. Field editable (nama/email/telpon).
- **Kalender (`src/pages/CalendarPage.jsx`):** sel bulan klik = `onSelectDate` saja; tombol "+" kecil di pojok kanan atas sel — tampil saat hover (selalu utk selected/today) → `onCellClick(date)` buka create modal. Week/day tetap klik-jam = create (natural, pola Google Calendar).
- **Rule fleksibilitas (`src/pages/RulesPage.jsx`):** tombol Zap "Jalankan Sekarang" di RuleCard → `handleRunNow`: `fetchMessages('folderINBOX')` → `matchRules(email, msg).includes(rule.id)` → `moveMessages` batch → `updateRule` runCount+lastRunAt → toast jumlah dipindahkan; empty → toast.info. Icon Loader2 saat running. Rule kini bisa diterapkan ke email yang SUDAH ada.
- **Validasi:** build OK + **20/20 test PASS** (baru test:date-groups 32 kasus), HMR live (localhost:5173). BELUM deploy — deploy.sh berikutnya.

## 2026-08-18 — Quick Rule: buat aturan 1-langkah langsung dari baris email — DONE

- **Permintaan user:** seberapa memungkinkan menambah rule utk email tertentu, fokus kemudahan penggunaan. Jawaban: engine rules SUDAH ada (`src/lib/autoArchive.js` + halaman `/rules`), tapi pembuatan manual (buka halaman → form dari nol) → tidak mudah ditemukan.
- **Implementasi:**
  - `src/components/mailer/QuickRuleModal.jsx` (baru): modal kecil dari baris email — pengirim TERISI OTOMATIS (extract email dari sender label), user tinggal pilih folder tujuan (default: Archive bila ada) + nama (default `Arsip dari <email>`) → `addRule` ke store yang SAMA dengan RulesPage (localStorage `auto_archive_rules_<email>`) → dieksekusi otomatis oleh MailPage (executeRules saat pesan dimuat). Aksi: pindah ke folder (sesuai pilihan user; tidak ada mark-read/flag).
  - `MailPage.jsx`: ikon Filter per-baris (hover desktop, pola sama snooze/arsip) → `setQuickRuleSender(senderLabel)` → render `QuickRuleModal` di root (isOpen = !!quickRuleSender).
  - Halaman `/rules` TETAP ada utk aturan kompleks (multi-kondisi, AND/OR, test rule) — Quick Rule = pintu cepat.
- **Catatan:** rules berlaku untuk pesan yang baru dimuat (rulesProcessed per-uid) — pesan lama di inbox tidak di-move ulang; perilaku disengaja.
- **Validasi:** build OK + 19/19 test PASS. Deploy via deploy.sh.

## 2026-08-18 — Fix "Gagal memindahkan pesan (404)" saat archive — endpoint moveMessages (bukan batchMoveToMailbox) — FIXED, siap deploy

- **Gejala:** tombol Arsip (header / per-baris) → toast "Gagal memindahkan pesan (404)".
- **Root cause:** `moveMessages` (api.js) POST ke `.../Mail/0/{folder}/batchMoveToMailbox` — endpoint itu TIDAK ADA di SOGo v5. Diverifikasi langsung di binary server: `grep -aoc 'moveMessages' MailerUI` = 3 hit, `batchMoveToMailbox` = **0 hit** (di container `mailcow-sogo-mailcow-1`, `/usr/local/lib/GNUstep/SOGo/MailerUI.SOGo/MailerUI`).
- **Cara SOGo asli** (`Mailer/Mailbox.service.js` `$moveMessages`): `Mailbox.$$resource.post(this.id, 'moveMessages', {uids, folder})` → POST `{folder}/moveMessages` body `{uids, folder}` — `folder` = **path relatif** (`Archive`, `INBOX/Sub`), bukan id berprefix (`folderArchive`). Respon berisi `unseenCount`.
- **Fix `src/lib/api.js`:** endpoint → `moveMessages`; payload `{uids, folder: targetPath}`. `targetPath` = `decodeURIComponent(id.replace(/^folder/,''))` jika string id, atau `folder.path || folder.name` jika objek.
- **Fix `src/pages/MailPage.jsx`:** semua pemanggil kirim OBJEK folder (bukan id): `trashFolder`/`junkFolder` via resolver `folderById('folderTrash'/'folderJunk')` + fallback `{path:'Trash'/'Junk'}`; `archiveMutation` & tombol arsip per-baris → `archiveFolder` (objek); dropdown "Pindah ke..." resolve `folderById(e.target.value)`; auto-archive rules tetap kirim string id (di-decode di api.js).
- **Audit endpoint lain vs binary SOGo (SEMUA valid):** `markMessageRead`, `markMessageUnread`, `markMessageFlagged`, `markMessageUnflagged` (3 hit), `batchDelete` (dipakai `$_deleteMessages` asli), `moveMessages` (3 hit), search = folder `view` + `filters` (fix sebelumnya). Aksi per-message SOGo asli pakai GET, app pakai POST — keduanya diterima (SOGo action routing mendukung POST).
- **Verifikasi:** build OK + **19/19 test PASS**.

## 2026-08-18 — Fix "Gagal mencari pesan" — search SOGo pakai folder view + filters (bukan /search) — FIXED

- **Gejala:** filter pengirim (klik nama → criteria from) → "Gagal mencari pesan".
- **Root cause:** `searchMessages` POST ke `/Mail/0/{folder}/search` — endpoint itu TIDAK ADA di SOGo v5 → 404 → error. Diverifikasi di log nginx: 404 utk SEMUA user sejak 13 Agu (bug lama yang baru kelihatan karena fitur cari-per-pengirim baru). Search yang 200 di log itu dari `/index.php?q=result&searchfor=advancesearch` (UI klasik), bukan json_api.
- **Cara SOGo v5 yang benar** (diverifikasi dari kode SOGo asli `Mailer/Mailbox.service.js` + `VirtualMailbox.service.js`, SOGo 5.12.9): search = `mailbox.$filter()` → `POST /Mail/0/{folder}/view` dengan body `{ sortingAttributes: {sort, asc}, filters: [{searchBy, searchInput, negative, operator}] }`. `searchBy` valid: `subject_or_from`, `subject_or_to`, `contains`, `body`, `from`, `to`, `subject`. Lokasi: `/usr/local/lib/GNUstep/SOGo/WebServerResources/js/Mailer/` di container `mailcow-sogo-mailcow-1`.
- **Fix:** `buildMessageSearchBody` map criteria UI (all/from/to/subject/body) → searchBy SOGo (all→contains, dari→from, dst), body view dgn filters. `searchMessages` POST ke `/view` (bukan `/search`).
- **Verifikasi:** test `message-requests` + `message-api` di-update ke format baru — **19/19 PASS**, build OK, HMR live. BELUM deploy.

## 2026-08-18 — Fix TDZ "can't access lexical declaration 'snoozedUids' before initialization" — FIXED

- **Gejala:** halaman mail crash — ErrorBoundary "Terjadi Kesalahan", `can't access lexical declaration 'snoozedUids' before initialization` di MailPage.
- **Root cause:** `displayMessages` (filter daftar) memakai `snoozedUids.has(...)`, tapi `const snoozedUids = useMemo(...)` dideklarasikan SETELAH `displayMessages` di body komponen → Temporal Dead Zone (TDZ) saat render pertama.
- **Fix:** pindah deklarasi `snoozedUids` (useMemo) + `archiveFolder` ke ATAS `displayMessages`. Urutan final: `snoozedUids` (374) → `displayMessages` (385) → `sortedMessages` (422) → `conversationGroups` (429) → `visibleOrderUids` (591) → `selectRangeFromAnchor` (600) — semua dependensi mendahului pemakai.
- **Verifikasi:** build OK, 19/19 test PASS, HMR live (localhost:5173). BELUM deploy.
- **Pelajaran:** deklarasi useMemo/const yang dipakai di filter/useMemo lain harus URUT — JS hoisting hanya berlaku utk function declarations, bukan const.

## 2026-08-18 — 5 fitur harian: snooze, badge per folder, quick reply, unduh semua lampiran, cari per pengirim — DONE (dev, BELUM deploy)

- **Snooze email (`src/lib/snooze.js` + test):** client-side MURNI (email tetap di Inbox, disembunyikan UI sampai wake) — tanpa folder/endpoint baru, aman. Presets: Nanti malam (3j), Besok pagi (12j), Akhir pekan (48j), Minggu depan (168j). Tombol Clock di baris (hover, INBOX) → picker durasi; `snoozedUids` filter di displayMessages; interval 60s pruneExpired → muncul kembali otomatis.
- **Badge belum dibaca per folder:** `getUnseenCount(sogoToken, folder)` (api.js, folder param — pathSegment allowEncodedSlash). MailPage `perFolderUnseen` query = `Promise.allSettled` utk folderJunk/folderSent/folderDrafts (paralel ringan, refetch 60s) → badge di sidebar renderFolderRow (folder.type inbox → unseen INBOX; lain → perFolderUnseen).
- **Quick reply di MessageReader:** tombol "Balas Cepat" (chevron) di toolbar → panel textarea di bawah body; kirim via `sendMessage` (SOGo compose flow + fallback SMTP, smtpToken dari store); Cmd/Ctrl+Enter kirim; penerima = replyTo || from; subjek Re:; body di-escape + newline→br.
- **Unduh semua lampiran:** tombol "Unduh Semua" di header Lampiran (muncul bila >1 lampiran) → `window.open` tiap downloadURL (toSafeUrl, base SOGO_BASE) di tab baru (session cookie ikut).
- **Cari per pengirim:** klik nama pengirim di baris → `searchBySender` (MailPage): ambil email dari sender text via regex, set searchInput+searchQuery+searchCriteria='from' → server-side searchMessages (folderId tetap di-set utk klasifikasi).
- **Validasi:** 19/19 test PASS (baru `test:snooze`), build OK, HMR live. BELUM deploy.

## 2026-08-18 — 5 fitur produktivitas: notifikasi, filter belum dibaca, tandai semua dibaca, arsip cepat, draft autosave — DONE (dev, BELUM deploy)

- **Notifikasi email baru (`MailPage`):** tab title jadi `(n) PCP Express Mail` saat ada belum dibaca (dari polling unseen 1 mnt) + `Notification API` (minta izin sekali; popup "Email baru — n pesan belum dibaca") saat unseen count NAIK di folderINBOX.
- **Filter Belum Dibaca:** tombol `MailOpen` di header list → `unreadOnly` state → hanya tampil `!m.isRead` (kombinasi dgn filter flag/kategori).
- **Tandai Semua Dibaca:** tombol `CheckCheck` di header (muncul bila ada pesan) → `markAllReadMutation` = `Promise.all(messages.map(markRead))` + invalidate unseen.
- **Arsip cepat:** tombol `Archive` di header (arsip semua folder) + per-baris saat hover (desktop). Target = folder root "Archive" yang DIVERIFIKASI ada di semua akun (doveadm mailbox list → Archive root, case-sensitive path). Fallback: jika tidak ketemu, tombol tidak ditampilkan.
- **Draft autosave (`ComposeModal`):** `createDraft` + `saveDraft` + `deleteDraft` baru di api.js (SOGo `/Mail/0/compose` → `folderDrafts/{id}/save` JSON → `batchDelete`). Autosave debounce 3 detik saat ada konten (to/cc/bcc/subject/body); draft dibuat sekali per bukaan; indikator footer "Menyimpan draf.../Draf tersimpan/gagal"; draft autosave DIHAPUS setelah kirim sukses (tidak menumpuk di Draf).
- **Test baru:** `test:draft-api` (create/save/delete + no-op uid null) — **18/18 PASS**, build OK, HMR live. BELUM deploy.

## 2026-08-18 — HtmlEditor: kontrol ukuran font (dropdown) — DONE (dev)

- **Permintaan user:** signature bisa atur ukuran font.
- **Implementasi (`src/components/HtmlEditor.jsx` — dipakai SignatureSection di PreferencesPage):**
  - Tombol dropdown "A ▾" di toolbar (setelah Underline) → 6 pilihan: Sangat Kecil s/d Sangat Besar Sekali.
  - `applyFontSize(size)`: `execCommand('styleWithCSS')` + `execCommand('fontSize', size)` → hasil `<span style="font-size:...">` — `style` sudah di `ADD_ATTR` di `PURIFY_CONFIG` (pasteUtils.js), jadi lolos DOMPurify (bukan tag `<font>`).
  - Dropdown menutup saat klik luar (mousedown listener) — pola sama dropdown lain di app.
- **Verifikasi:** build OK, HMR live di localhost:5173. BELUM deploy.
- **Catatan:** fitur ini otomatis tersedia di SEMUA pemakaian HtmlEditor (saat ini hanya SignatureSection).

## 2026-08-18 — Fitur range-select checkbox (Shift+klik, pola Gmail) — DONE (dev)

- **Permintaan user:** tambah blok-seleksi utk checklist (Shift+klik pilih banyak baris sekaligus).
- **Implementasi (`MailPage.jsx`):**
  - `lastSelectedUid` (useRef) = anchor seleksi terakhir, di-reset saat ganti folder/search.
  - `visibleOrderUids` (useMemo) = urutan baris yang TAMPIL (flat `sortedMessages` atau flatten `conversationGroups` saat conversation view) — range select mengikuti urutan visual, bukan urutan uid.
  - `selectRangeFromAnchor(uid)`: Shift+klik → cari index anchor & target di urutan tampil → pilih semua di antaranya (termasuk keduanya), union dgn seleksi yang ada → anchor pindah ke baris terakhir diklik (bisa extend berulang). Tanpa anchor valid → fallback toggle biasa.
  - `toggleSelectMsg(e, uid)`: `e.shiftKey` → range select; selain itu toggle + set anchor.
- **Verifikasi:** build OK, HMR live di localhost:5173. BELUM deploy.

## 2026-08-18 — Rapikan kontrol baris pesan: checkbox ganti avatar (Gmail style), star pindah kanan — DONE (dev)

- **Keluhan user:** checkbox + star overlay di atas avatar (kolom 32px) menumpuk → kurang jelas.
- **Redesign `MailPage.jsx` renderMessageRow:**
  - **Checkbox** kini MENG-GANTI avatar saat hover/seleksi (pola Gmail): avatar cross-fade opacity → checkbox di posisi yang sama, lingkaran bg-background + border + shadow → jelas sebagai tombol, tidak menumpuk.
  - **Star/flag** dipindah ke KANAN baris (sebelah tanggal, di baris sender): berflag/hover desktop → tampil; layar sentuh selalu tampil. Tidak lagi nimpa avatar.
  - Picker warna flag tetap di-anchor ke posisi klik (e.clientX/Y) — tidak berubah.
- **Verifikasi:** build OK, HMR live di localhost:5173. BELUM deploy.

## 2026-08-18 — Login "Gagal mendaftarkan sesi SMTP" di dev → SMTP session non-blocking — FIXED

- **Gejala:** user login di localhost:5173 → pesan "Gagal mendaftarkan sesi SMTP." dan tidak masuk.
- **Root cause:** login sukses di SOGo (proxy → produksi), lalu `registerSmtpSession` POST `/api/auth/smtp` → di dev Vite proxy ke `127.0.0.1:3001` (backend server.js lokal TIDAK jalan — butuh env DB/SMTP Mailcow) → error → LoginPage lama **logout + throw** → login dibatalkan. Ini juga bug production potensial: kalau backend SMTP (sogo-smtp-proxy 3005) down, SEMUA user terkunci dari login padahal baca email tetap bisa.
- **Fix (`src/pages/LoginPage.jsx`):** `registerSmtpSession` jadi **non-blocking** — kalau gagal, `smtpToken=null` + lanjut login; tampilkan `toast.warning` ("Login berhasil. Sesi SMTP tidak tersedia — kirim email mungkin gagal, baca email tetap bisa."). Login tidak lagi bergantung pada backend SMTP.
- **Verifikasi:** build OK, `test:login-flow` + `test:preferences-fallback` PASS, HMR live di dev (localhost:5173). BELUM deploy.
- **Konsekuensi dev:** di localhost, sesi SMTP tidak akan terbentuk (backend lokal tak ada) → kirim email gagal di dev, baca email normal. Di production tidak berubah (nginx → 3005 jalan). Kalau mau kirim email dari dev, perlu backend SMTP lokal — di luar scope.

## 2026-08-18 — Fitur analisis email (kategori) + signature ala Outlook — DONE (dev, BELUM deploy)

- **Tujuan user:** "bagaimana sogo-frontend memudahkan pekerjaan" — analisa email (spam/promo/lainnya) + signature mudah seperti Outlook. Constraints: boleh apa saja asal TIDAK merusak production.
- **Klasifikasi email** — `src/lib/emailCategory.js` (murni, tanpa JSX): `classifyEmail(msg)` pakai `folderId` + `from` (domain) + `subject` → `utama | promo | sosial | update | spam`. Kategori tab di header MailPage (Semua/Utama/Promosi/Sosial/Update + counter) + badge warna di baris pesan (Promosi oranye, Sosial biru, Update teal). **Zero request tambahan ke SOGo** — semua dari data list view yang sudah ada (`m.folderId` ditambah di `fetchMessages`/`searchMessages` di api.js). Spam = folder Junk (Mailcow/Rspamd sudah menyaring).
  - Domain sosial: facebookmail/linkedin/instagram/youtube/tiktok/whatsapp/telegram/discord/pinterest/snapchat/reddit/medium/substack/dll.
  - Domain promo: mailchimp/sendgrid/sendinblue/brevo/mailgun/mailerlite/klaviyo/hubspot/zoho/dll + kata kunci subjek (promo/diskon/sale/voucher/newsletter/dll, batas-kata utk kata pendek agar "sale" tidak cocok "salesman").
  - Domain update: no-reply/notifications/github/gitlab/paypal/stripe/amazon/google/microsoft/tokopedia/shopee/lazada/bca-bri-mandiri/gojek/grab/traveloka/zoom/slack/dropbox/dll + kata kunci (verifikasi/otp/invoice/pembayaran/resi/dll). Kata ambigu (update/login/pin) TIDAK dipakai agar email personal tidak salah kategori.
- **Signature ala Outlook** — `src/lib/signatures.js`: storage per-akun `pcp_signatures_<email>` = `{ list: [{id,name,html}], defaults: { new, reply } }`. API: load/add/update/remove/setDefault/getSignatureFor(kind).
  - `PreferencesPage` SignatureSection ditulis ulang: daftar signature + nama + ukuran, tombol default per mode (Pesan Baru/Balasan), editor HtmlEditor per signature, hapus, "Sinkronkan ke SOGo" (simpan default ke SOGoMailSignature utk klien lain). Migrasi: signature SOGo lama otomatis jadi signature pertama.
  - `ComposeModal`: inject signature lokal sesuai mode (`composeMode` 'new'|'reply' — ditambah di MessageReader handleReply/handleForward), fallback ke SOGoMailSignature lama bila belum ada signature lokal; dropdown "Signature" di footer utk sisipkan pilihan lain.
- **Validasi:** 17/17 `npm run test:*` PASS (16 lama + `test:email-category` + `test:signatures`), `npx vite build` OK (219ms). Dev server localhost:5173 melayani modul baru (HMR). **BELUM deploy** — menunggu review user.
- **Batasan yang disengaja:** klasifikasi client-side heuristik (bukan AI/server filter); header List-Unsubscribe/X-Spam-* tidak diminta dari SOGo karena tidak tersedia di list view — menjaga kompatibilitas. Signature lokal hanya berlaku di webmail ini (klien SOGo lain pakai signature yang di-sync).

## 2026-08-18 — Setup dev lokal (tanpa deploy): Vite dev server + proxy SOGo produksi — VERIFIED

- **Tujuan:** user mau develop sogo-frontend di workspace mac saja, review perubahan di browser lokal, TANPA deploy dulu.
- **Cara pakai:** `npm run dev` → Vite di `http://localhost:5173/webmail/` (base `/webmail/`). Vite config sudah proxy: `/SOGo` → `https://mail.pcpexpress.co.id` (cookieDomainRewrite localhost + strip Secure/SameSite → login SOGo asli jalan dari localhost), `/api` → `http://127.0.0.1:3001` (butuh server.js lokal bila fitur /api dipakai; UI login+baca mail cukup proxy /SOGo).
- **Verifikasi (18 Agu):** index 200 ✅; `/SOGo/so/` via proxy → 200 (SOGo produksi merespons) ✅; `POST /SOGo/connect` dummy creds → 403 (pipeline login jalan, ditolak wajar) ✅. Log proxy `[PROXY →/←]` terlihat di console Vite.
- **Catatan env:** `VITE_SOGO_BASE_URL` default kosong (same-origin) — aman di dev. `VITE_API_KEY` hanya dibutuhkan build production (deploy.sh mengisinya dari mailserver). Tidak perlu `.env` lokal utk review UI.
- **Catatan sandbox:** proses background Vite mati bila shell sesi berakhir (nohup tidak cukup di lingkungan terminal agent) — user harus jalankan `npm run dev` di terminal sendiri supaya server bertahan.
- **Batasan dev lokal:** `/api/*` (kirim email via proxy SMTP 3001, preferences, health) tidak jalan tanpa `server.js` + env DB/SMTP (butuh akses DB Mailcow; constraint project-context). Utk review UI/login/baca mail, `/SOGo` proxy cukup.

## 2026-08-18 — Control Tower mailboxes kosong: /api/v1/* kehilangan inject X-API-Key — FIXED

- **Gejala:** `https://mail.pcpexpress.co.id/control-tower/mailboxes` (dan halaman lain yang pakai /api/v1 Mailcow) kosong — tidak ada data mailbox.
- **Root cause:** patch hapus gate /api/v1 (18 Agu 03:19) menghapus `location ^~ /api/v1/` SELURUHNYA — termasuk **inject X-API-Key server-side via FastCGI** yang selama ini membuat request apa pun ke /api/v1/* lolos auth Mailcow. Setelah patch, /api/v1/* jatuh ke template Mailcow (`location ~ ^/api/v1/(.*)$` → json_api.php) TANPA X-API-Key → SPA Control Tower (Bearer JWT CT) ditolak/body kosong → dashboard kosong.
- **Fix (04:40):** restore `location ^~ /api/v1/` FastCGI + `fastcgi_param HTTP_X_API_KEY` (dari backup .bak-20260818) **TANPA gate auth_request** (gate-lah yang membunuh UI Mailcow). Sekarang: UI Mailcow (session cookie) DAN Control Tower SPA (Bearer) dua-duanya lolos karena X-API-Key inject server-side.
- **Verifikasi:** `/api/v1/get/mailbox/all` → 200 **919KB** data; `/api/v1/get/domain/all` 200 4.5KB; `/api/v1/get/passwordpolicy/html` 200; `/api/v1/get/status/containers` 200; `POST /` login Mailcow → 200 "Login failed" (pipeline normal); `/api/version` 200; `/api/monitor/status` 401 (butuh JWT — normal). nginx -t OK + reload.
- **⚠️ Catatan keamanan (status quo pra-11 Agu):** /api/v1/* kini efektif tanpa autentikasi tambahan — siapa pun yang bisa mencapai endpoint punya akses penuh API Mailcow (X-API-Key di-inject nginx, tidak ke browser). Ini kondisi yang sama dengan pra-11 Agu. Mitigasi jangka panjang: batasi /api/v1/* ke origin yang dikenal atau pindahkan Control Tower ke path sendiri.

## 2026-08-18 — Dashboard migration portal kosong: salah direktori (migration-portal vs imapsync-migrate) — FIXED

- **Gejala:** user login `/migrate/admin/` sukses tapi dashboard kosong (1 user, padahal seharusnya 522).
- **AKAR PENTING — ada DUA proyek portal:**
  - `/home/anas.fikri/imapsync-migrate` = **proyek ASLI/LIVE** — auth via `scripts/admin-auth-check.sh` (doveadm pw -t, support SEMUA skema Mailcow incl. SSHA256), env `MAILCOW_API_KEY/ADMIN_USER/ADMIN_PASS/JWT_SECRET` di `.env.server`, **data 522 job + 520 token** (update terakhir 18 Agu 01:17).
  - `/home/anas.fikri/migration-portal` = **salinan TUA** — auth bcryptjs (+ patch SSHA256 18 Agu oleh saya), data cuma 1 job (6 Agu).
- **Kesalahan saya:** kemarin (03:05) restart portal dari `migration-portal` (ikut handoff lama yang menyebut path itu) → proses nohup migration-portal pegang port 3007 → dashboard tampil data 1 job → "isinya hilang semua". Unit systemd asli (17 Agu 12:06) sebenarnya BENAR menunjuk `imapsync-migrate`, tapi crash-loop EADDRINUSE karena port dipegang proses migration-portal. Catatan: saran sed saya untuk mengubah unit systemd ke `migration-portal` (04:26) juga KELIRU — jangan diikuti; unit harus kembali ke imapsync-migrate.
- **Fix (LIVE):** kill proses migration-portal (621197), start `imapsync-migrate` via `(set -a; source .env.server; exec /usr/bin/node server.js)` nohup → pid 670022, cwd imapsync-migrate, env lengkap. Verifikasi: `/api/admin/stats` = **total 522, done 408, failed 114**; `/api/admin/users` 200; health 200; helper auth bash jalan (`HASH {BLF-CRYPT}...` utk anas.fikri).
- **⚠️ TODO user (butuh sudo):** unit systemd `migration-portal.service` sekarang menunjuk `migration-portal` (salah) & crash-loop. Kembalikan ke imapsync-migrate:
  ```bash
  sudo sed -i 's|/home/anas.fikri/migration-portal|/home/anas.fikri/imapsync-migrate|g' /etc/systemd/system/migration-portal.service
  sudo systemctl daemon-reload
  # unit akan crash-loop EADDRINUSE sampai proses nohup imapsync-migrate mati;
  # setelah itu unit start sendiri (atau systemctl restart migration-portal.service)
  ```
- **Catatan:** `.env.server` migration-portal sempat saya tambahi DB vars (tidak merusak, backup ada). Auth imapsync-migrate TIDAK butuh DBUSER/DBPASS — pakai MAILCOW_API_KEY + helper doveadm. Login portal = username bare (`anas.fikri`).

## 2026-08-18 — Migration portal login rusak: proses tanpa env DB (restart nohup) — FIXED

- **Gejala:** login `/migrate/admin/` dgn kredensial Mailcow (mis. `anas.fikri`) selalu ditolak "Username atau password salah" walau password benar.
- **Root cause:** proses portal (restart nohup 03:05 saat patch SSHA256) dijalankan **TANPA memuat `.env.server`** → `DBPASS` kosong → query mysql `-p""` memicu prompt interaktif → `Access denied ... using password: NO` → `verifyAdminPassword` selalu false. Unit systemd `migration-portal.service` juga rusak: WorkingDirectory + EnvironmentFile menunjuk `/home/anas.fikri/imapsync-migrate` (salah — seharusnya `/home/anas.fikri/migration-portal`), crash-loop (NRestarts 545, EADDRINUSE + path salah).
- **Fix:** tambah `DBUSER/DBPASS/DBNAME` ke `/home/anas.fikri/migration-portal/.env.server` (dari mailcow.conf, backup `.env.server.bak-20260818-2`); `chmod +x start.sh`; kill proses systemd yang merebut port, start via `nohup bash start.sh` (env lengkap).
- **Verifikasi:** env proses (pid 621197) = DBUSER/DBPASS/DBNAME ter-set, cwd migration-portal; login pass salah → 401 JSON normal, `verify error` count TIDAK bertambah; via nginx `/migrate/api/auth/login` 401 normal + `/migrate/health` 200.
- **⚠️ TODO user (butuh sudo):** perbaiki unit systemd — `WorkingDirectory=/home/anas.fikri/migration-portal`, `EnvironmentFile=/home/anas.fikri/migration-portal/.env.server`, `ExecStart=/usr/bin/node server.js` → `systemctl daemon-reload` + start. Saat ini portal dilayani proses nohup (bukan systemd) — kalau host restart, portal tidak otomatis up (atau unit rusak yang start dengan env salah → login rusak lagi).
- **Catatan:** login admin portal = username BARE (mis. `anas.fikri`), BUKAN email — query `admin` table exact match.

## 2026-08-18 — ROOT CAUSE "Sesi SOGo tidak terbentuk": sync_sogo_passwords.sh flush memcached tiap 5 menit — FIXED & TERBUKTI

- **Gejala (user report):** `https://mail.pcpexpress.com/webmail/login` → pesan "Sesi SOGo tidak terbentuk. Periksa cookie browser, proxy, atau status akun lalu coba lagi." = `warmUpSogoSession()` di `src/lib/api.js` dapat 401/403 di shell `/SOGo/so/{user}` / `/Mail/view` / `/Mail/0/view` setelah `/connect` sukses.
- **Root cause:** `sync_sogo_passwords.sh` (cron tiap 5 mnt di mailserver) menjalankan **`flush_all` memcached TANPA SYARAT** — bahkan saat `ROW_COUNT = 0` (tidak ada password berubah). SOGo menyimpan SESI di memcached (`SOGoMemcachedHost = "memcached"`; key `session:*` teramati) → **SEMUA sesi webmail mati tiap 5 menit**. Race: user login → `/connect` buat sesi → cron flush di antara `/connect` dan warm-up → warm-up 403 → "Sesi SOGo tidak terbentuk". Juga user yang sedang pakai webmail kena logout mendadak tiap ≤5 menit (pola keluhan "ga bisa login" / "Login ditolak" yang selama ini disalahkan ke password user).
- **Bukti observasi langsung:** 03:29 ada 2 sesi → 03:30:20 (tepat setelah cron tick) **NOL sesi** → 03:32 sesi baru muncul (user re-login). Setelah fix: sesi bertahan lewat 4 tick cron (03:35/03:40/03:45/03:50), keys memcached 10 → 22 (tidak pernah nol).
- **Mengapa flush ada:** SOGo cache hash password di memcached (key `<user>+attributes` berisi `"password":"<hash>"`). Flush dimaksudkan utk invalidasi cache password saat reset. Tapi tak perlu tiap 5 mnt saat tidak ada perubahan.
- **Fix:** edit `/home/anas.fikri/sync_sogo_passwords.sh` — flush hanya jika `ROWS > 0` (backup `.bak-20260818`). `bash -n` ✅, jalan manual → `updated 0 rows (no change, cache kept)` ✅.
- **Efek samping positif:** `x+failedlogins` (throttle brute-force) tidak lagi di-reset tiap 5 mnt → deteksi brute force lebih efektif.
- **Catatan:** 403 `/SOGo/so/{user}/Mail` (tanpa `/view`) di log nginx = navigasi langsung browser dgn sesi mati (warisan flush lama), bukan warm-up flow. Warm-up paths (`/Mail/view`, `/Mail/0/view`) mayoritas 200.

## 2026-08-18 — Verifikasi Control Tower pasca-hapus gate /api/v1 — route Express sempat hilang, di-restore

- **Temuan:** patch hapus gate /api/v1 sebelumnya TERLALU BANYAK menghapus — dari `location @api_v1_unauthorized` sampai EOF ikut terhapus route Control Tower: `location ~ ^/api/mcp` → 3004 (MCP) dan `location ~ ^/api/(auth/|crowdsec/|...|monitor/)` → 3003 (Express JWT). Akibatnya `/api/auth/login` dll 404 → Control Tower login JWT mati.
- **Fix:** restore kedua blok route dari `.bak-20260818` ke `site.control-tower.custom` (append). `nginx -t` OK + reload.
- **Verifikasi penuh (semua lewat nginx):** POST `/api/auth/login` → 401 `{"error":"Password salah"}` (login pipeline jalan); GET `/api/monitor/status` → 401 (butuh JWT — normal); `/api/version` → 200; `/api/v1/get/status/containers` → 200 (Mailcow); `/api/mcp` → 3004. Control Tower dashboard berfungsi penuh.
- **Sisa konflik minor:** `GET /api/health` → 403 dicegat `location = /api/health` (webmail → 3005 sogo-proxy). Control Tower pakai `/api/version` (200), health tidak dipakai dashboard — dicatat, bukan blocker.
- **Catatan keamanan:** `/api/v1/*` kini tanpa gate (Mailcow json_api auth normal: session cookie / X-API-Key). Get/status publik; endpoint add/edit tetap butuh auth Mailcow. Control Tower SPA kirim Bearer JWT (Control Tower) yang json_api abaikan — fitur yang butuh X-API-Key Mailcow tidak jalan dari Control Tower (status quo pra-11 Agu).
- **Pelajaran:** saat patch nginx, selalu diff hasil terhadap backup & tes SEMUA route keluarga /api sebelum reload; jangan hapus range lebar (dari marker ke EOF) tanpa cek isi setelahnya.

## 2026-08-18 — Fix halaman email-settings teks putih di sebagian browser

- **Gejala:** sebagian orang lihat `webmail/help/email-settings.html` tulisannya putih (tidak terbaca).
- **Root cause:** `:root { color-scheme: light dark; }` — browser yang memilih skema gelap dari `color-scheme` tapi TIDAK support media query `prefers-color-scheme` → teks default browser jadi putih, background tetap terang (#f6f7f9) → putih di putih. Anchor (`a`) juga tanpa warna eksplisit (ikut default browser).
- **Fix (public/help/email-settings.html):** `color-scheme: light` default + `color-scheme: dark` di dalam media query dark (konsisten), warna eksplisit utk `a` (#1d4ed8 light / #93c5fd dark). Semua kombinasi browser terbaca.
- **Delivery:** build ✅ → `./deploy.sh` (rsync + nginx reload) → HTTP 200 kedua domain, CSS fix terverifikasi live.

## 2026-08-18 — ROOT CAUSE admin Mailcow: gate /api/v1/* (Control Tower) memblokir UI Mailcow — FIXED

- **Gejala:** banyak orang tidak bisa login, termasuk tim utk login admin Mailcow (`mail.pcpexpress.co.id/`).
- **Root cause:** `site.control-tower.custom` (nginx) punya `location ^~ /api/v1/` + **`auth_request` gate** (JWT Bearer dashboard / X-API-Key MCP, via `server.js:3003/api/auth/v1-check`) sejak 11 Agu (diff vs .bak 27 Jul: dulu proxy balik tanpa gate). Gate ini menangkap **SEMUA** `/api/v1/*` — termasuk yang dipakai UI admin Mailcow (`/api/v1/get/passwordpolicy/html`, dll) → semua 401 "Unauthorized: provide Bearer token or X-API-Key" → UI Mailcow tidak bisa login/berfungsi.
- **Fix:** hapus block `^~ /api/v1/` + `@api_v1_unauthorized` dari site.control-tower.custom (backup `.bak-20260818`), `nginx -t` OK + reload. `/api/v1/*` kembali ke Mailcow (template regex `json_api.php`).
- **Verifikasi:** GET `/api/v1/get/*` 200; `POST /` (form login Mailcow, `login_user`/`pass_user` → fetch ke halaman sendiri, BUKAN `/api/v1/login`) → 200 "Login failed" utk password salah (pipeline normal); 4 URL user 200; Control Tower SPA + `/api/v1/get/status/containers` 200.
- **Catatan:** `/api/v1/login` 404 = NORMAL (UI Mailcow login via `POST /`, bukan /api/v1/login). json_api.php mtime 6 Agu.
- **Password admin `admin` TIDAK match `AdminMail2026!`** (docs 05 Agu) — sudah berubah. Tim yang masih "Login failed" dgn password benar → password di DB beda → reset password (via Mailcow UI yg kini pulih, atau minta bantuan set hash).

## 2026-08-18 — Fix migration portal: akun SSHA256 tidak bisa login walau password benar

- **Gejala:** user login `https://mail.pcpexpress.co.id/migrate/admin/` dgn password benar → "Username atau password salah". Khawatir mail client kena masalah sama.
- **Root cause:** `admin@pcpexpress.co.id` di tabel `admin` (Mailcow DB) ber-scheme **`{SSHA256}`** (48B = sha256+salt). `verifyAdminPassword` di `/home/anas.fikri/migration-portal/src/routes/auth.js` hanya pakai **bcryptjs** — TIDAK support SSHA256 (compareSync throw → catch → false) → login akun tsb SELALU gagal. Bonus bug: scheme `CRYPT/SHA256-CRYPT/SHA512-CRYPT` tercantum sebagai didukung padahal bcryptjs tidak bisa memverifikasinya (gagal diam-diam).
- **Fix (patch di server, backup `auth.js.bak-20260818`):** tambah `verifySsha256()` (sha256(pass+salt) vs digest 32B, `timingSafeEqual`), route SSHA256 ke sana, hapus scheme non-bcrypt dari daftar. `node --check` ✅, login SSHA256 + BLF dgn password salah → 401 normal ✅, portal restart (pid baru, port 3007).
- **Mail client TIDAK terpengaruh:** semua 615 mailbox `{BLF-CRYPT}` (Dovecot normal). Isu ini khusus migration portal/admin table.
- **TODO user:** coba login ulang `admin@pcpexpress.co.id` di /migrate/admin/. Kalau masih ditolak → akun yang dipakai mungkin `admin`/`anas.fikri` ({BLF-CRYPT}) → password di DB beda dari yang diketik → reset password via Mailcow admin.

## 2026-08-18 — INCIDENT LIVE: login webmail gagal massal + kantor timeout (resolved sebagian)

### Gejala (user report)
- Banyak cabang beda lokasi: "Login ditolak SOGo, periksa email/password, status mailbox aktif".
- Dari jaringan kantor (115.178.128.130): webmail loading terus (timeout semua domain).

### Root cause kantor (RESOLVED ✅)
- **MikroTik auto spam-blocklist** (`/home/anas.fikri/spam-detect.sh` di mailserver, cron tiap 2 mnt): IP kantor `115.178.128.130` ke-block (≥5 SASL failed/5mnt — mesin di kantor login-loop pakai kredensial lama: abdul.latif 253x, trivina, hervi.meisari dll) → forward rule DROP semua trafik kantor → timeout total.
- **CrowdSec ban** `115.178.128.130` (postfix-spam, 7 decisions) — false positive: dari IP itu justru auth user perusahaan sendiri (yuni.rahayu sukses kirim).
- Fix: unban CrowdSec + allowlist permanen `kantor` (cscli allowlists) + hapus dari MikroTik blocklist 2x + **whitelist prefix `115.178.128.` di spam-detect.sh WL_PREFIX** (backup .bak-20260818). Webmail HTTP 200 kedua domain ✅, tidak ke-block lagi setelah 2 siklus script.

### Root cause cabang (BELUM sepenuhnya resolved — butuh reset password)
- **Bukan bug sistem:** sync password OK (0 mismatch `_sogo_static_view` vs `mailbox`, sync_sogo_passwords.sh jalan), mayoritas user login sukses (195–434 user unik/hari).
- **Sebagian user password tidak cocok** dgn DB → auth gagal → (a) pesan "Login ditolak SOGo", (b) cascade ban IP (CrowdSec dovecot-spam + MikroTik) → cabang mati total.
- **Brute force/password spraying 16 Agu:** 9271 failed auth (baseline 400–600/hari), 67 user unik ditarget; 17 Agu 1238, 18 Agu 249 (sejauh ini). IP asing: 66.228.34.203 (181x), 66.132.172.x, 149.56.179.95 (OVH).
- Skala: 233 user unik gagal dalam 24h terakhir dari 613 aktif; IP unik 191 (campur bot + IP ID Telkom/XL = cabang).

### Insight teknis penting
- String `lt0qcqr9szh8pm4x9tb7z8whjtgxqdpu` di log SOGo (login IMAP semua user) = **password SSO internal Mailcow** (`sogo-sso.pass`, `cron.creds`, `dovecot/sogo-sso.conf`) — BUKAN password user, BUKAN krisis password tunggal.
- Auth SOGo: `_sogo_static_view.c_password` = copy `mailbox.password` ({BLF-CRYPT} bcrypt, salt acak → hash beda ≠ password beda).
- Dovecot failed: 825/24h; user teratas anas.fikri@pcpexpress.com (328x), abdul.latif (262x, 253 dari kantor).

### TODO user
1. **Reset password akun yang tidak bisa login** (via Mailcow admin UI atau minta daftar akun — bisa dipulihkan dari log).
2. **Perbaiki mesin/aplikasi email di kantor** yang login-loop dgn kredensial lama (abdul.latif dll) — whitelist hanya cegah blokir, bukan hentikan attempt.
3. Hardening lanjutan (smtpToken cookie httpOnly, rotasi password, history scrub) masih antri.

## 2026-08-18 — Sync perubahan server innaka → GitLab → workspace (mac)

- **Cek server innaka** (`/home/anas.fikri/mailcow-frontend`): working tree clean, `main` up-to-date dgn `origin/main`, berisi 2 commit yang belum ada di workspace mac: `8a3867d` (fix: 401/403 dari `/api/*` tidak picu session-expired + persist smtpToken) dan `d427590` (docs handoff) — keduanya sudah di-push server ke GitLab.
- **Workspace** fast-forward `f99431c → d427590` (merge --ff-only), kini identik dgn origin/main.
- **Validasi ulang di workspace:** 15/15 `npm run test:*` PASS (termasuk `test:preferences-fallback`) + `npx vite build` ✅ (226ms).
- `knowledge.md` diisi (kosong sejak dibuat); catatan sinkronisasi ditambahkan ke current-task; docs di-commit + push.
- Pelajaran: repo dijalankan dari BANYAK workspace (mac, server innaka, dll.) — selalu `git fetch` + cek log server sebelum bekerja agar tidak kerja di versi basi.

## 2026-08-17 — Fix `/api/preferences` 401 (sesi SMTP hilang saat reload) — deployed

### Gejala
- Setelah reload halaman webmail, console: `GET /api/preferences → 401`; dulu memicu force logout + redirect login + mailbox kosong ("tadi muncul, sekarang kosong") + login berulang.

### Root cause
- `smtpToken` (UUID sesi SMTP proxy `/api/auth/smtp`) hanya di memori (authStore tidak persist) → hilang saat reload.
- `/api/preferences` di server butuh `X-SMTP-Token` valid (`requireSmtpSession` → 401; bukan API key — 401 ≠ 403).
- `fetchPreferences` lama memanggil `throwApiError(401)` → `_onSessionExpired` → clearUser + redirect → `fetchFolders` di-abort → mailbox kosong.
- SOGo `/send` = 501 → `/api/send` (butuh smtpToken) jalur kirim yang bekerja → tanpa token kirim email gagal setelah reload.

### Changes
- `src/lib/api.js` — `fetchPreferences`: 401/403 dari `/api/*` TIDAK lagi memicu session-expired; graceful fallback ke localStorage (resolve, bukan reject).
- `src/store/authStore.js` — `smtpToken` di-persist (partialize); kredensial (user+pass) tetap tidak pernah dipersist.
- `scripts/test-preferences-fallback.mjs` (baru) + `package.json` `test:preferences-fallback`.

### Validation
- 15/15 `npm run test:*` PASS (termasuk test baru) | `npx vite build` ✅

### Delivery
- Commit/push + deploy LIVE via `DEPLOY_SSH_HOST=deploy-mail ./deploy.sh` (preflight → build → rsync → nginx → verify).

## 2026-08-17 — Sync workspace + update ai-toolkit engine + rapikan repo

### Changes
- Workspace (Linux) fast-forward `640e444 → ce215bf` — tadinya tertinggal 21 commit dari origin/macanas/production.
- ai-toolkit engine terakhir diterapkan ke repo: `AGENTS.md` dedup blok protocol (sebelumnya ganda), tambah `docs/ai/knowledge.md` + `docs/ai/next-tasks.md`, referensi `STANDARD_DEVELOPMENT.md` di `operating-model.md`. Engine `~/.ai-toolkit` sendiri sudah versi terakhir (`fcf404d` = GitHub) — tidak perlu pull.
- Hapus 5 file debug sisa di root: `test_rq.js`, `test_rq2.js`, `test_rq3.jsx`, `test_sogo.js`, `sogo.html`.
- Recover 2 test hilang dari macanas: `scripts/test-mailbox-tree.mjs` + `scripts/test-message-html.mjs` (direferensikan `package.json` tapi ter-ignore `test-*` → `git add -f`).
- Rapikan `.gitignore` (hapus entri `ai-state.json` kontradiktif; tambah pola `test_rq*`/`test_sogo.js`/`sogo.html`).

### Validation
- Build ✅ | 14/14 `npm run test:*` PASS | `git diff --check` ✅

### Delivery
- Commit `cdeef98` (chore) + `ec7555a` (docs) dipush ke `origin/main`.

## 2026-08-17 — Round 9.7: tuntas — IP login bukan sinyal kompromi

- **Konfirmasi IP:** `182.2.178.5` = Telkomsel mobile (West Java), `36.94.139.26` = Telkom ISP (West Java) — keduanya Indonesia, konsisten perangkat normal (IP mobile berputar). IP login BUKAN bukti kompromi.
- **Verdict keamanan final:** 0 SMTP AUTH 48 jam + volume keluar normal + tanpa script spam = akun tidak terkompromi. User **menolak rotasi password** ("gaaaas") — dicatat; alasan rotasi yang lebih relevan (leak historis `sogo_test.py`) tetap tersedia bila nanti diinginkan.
- **Status:** item keamanan ditutup.

## 2026-08-17 — Round 9.6: investigasi hard-refresh → logout

- **Gejala:** user hard refresh langsung ke layar login ("Sesi berakhir").
- **Temuan:** (1) `SOGoSessionTimeout` TIDAK diset di sogo.conf → default SOGo **30 menit idle** → refresh setelah jeda = sesi mati = 403 = kick login; (2) sesi SOGo = cookie per-domain — login di `.co.id` tidak berlaku di `.com` (app kini jalan di dua domain setelah fix SOGO_BASE) → ganti domain + refresh = logout.
- **Bukan penyebab:** hard refresh tidak menghapus cookie; SOGo up 10 hari (tanpa restart).
- **Pending (menunggu konfirmasi user):** naikkan `SOGoSessionTimeout = 480` (8 jam) di sogo.conf + restart SOGo (semua sesi putus sesaat); atau user disiplin satu domain.

## 2026-08-17 — Round 9.5: panduan email per-klien + port alternatif terverifikasi

- **Verifikasi port (dari jaringan user):** standar 993/465/587 CLOSED di internet, alternatif 1993/1465/1587 OPEN (+995); di IP internal 10.10.10.5 justru standar OPEN & alternatif closed → panduan menyajikan dua set port dgn badge jaringan.
- **Isi halaman** `public/help/email-settings.html` diperluas: tabel port standar vs alternatif (1993 IMAP / 1465 SMTP SSL / 1587 submission STARTTLS), langkah per-klien — Outlook Windows, Outlook macOS, Apple Mail (iPhone/iPad/Mac), Thunderbird — semua SSL/TLS, username = email lengkap, host dinamis `mail.<domain>`.
- **Validasi:** build ✅, HTTP 200 di .com & .co.id ✅, push `9ae9097`.

## 2026-08-17 — Round 9.4: investigasi banjir bounce "Mail delivery failed" (keamanan)

### Temuan
1. **Dua sumber bounce:** (a) relay keluar semalam (16 Agu) ke `smtp-pre.dnet.net.id:25` tanpa auth → "Relay access denied" → bounce balik; kiriman ke alamat test (utester@dnet.net.id, dedysugiarto041@gmail.com, uutteesstteerr@gmail.com) — pola tes manual, bukan spam. Relay kini `[smtp-pre.dnet.net.id]:26` + SASL — terbukti `status=sent` (09:12, mulyawardhana@gmail.com) ✅. (b) Spoofing eksternal via `smtp.mailchannels.net` (ESA "550 5.7.1 Sender blocked") — infrastruktur kita TIDAK pakai MailChannels; pihak luar memalsukan From anas.fikri@pcpexpress.com → bounce balik ke korban. Ini di luar kendali sumber; DMARC p=quarantine + SPF ~all sudah membatasi dampak.
2. **Akun aman:** 0 SMTP AUTH sebagai anas.fikri (48 jam); volume keluar normal (11/24 jam, ukuran tes); tidak ada script server yang merujuk alamat test tsb.
3. **Perlu konfirmasi user:** login webmail/IMAP 48 jam dari `182.2.178.5` (17x) + `36.94.139.26` (1x) — harus dipastikan perangkat milik user; jika bukan → rotasi password.
4. **Rekomendasi (pending user):** SPF `~all` → `-all` (semua pengirim sah sudah ter-cover include dnet/google).

### Follow-up yang dibutuhkan
- Konfirmasi 2 IP login; opsional rotasi password; opsional SPF `-all` di DNS.

## 2026-08-17 — Round 9.3: halaman Panduan Setting Email + autofocus login

- **Bug:** Tombol "Panduan Setting Email" (LoginPage + Sidebar) menunjuk `/webmail/help/email-settings.html` yang tidak pernah ada di dist → 404.
- **Fix:** buat `public/help/email-settings.html` (statis, Vite salin ke dist): tabel pengaturan IMAP 993/POP 995/SMTP 465-587, panduan cepat Outlook/Thunderbird/iOS/Android, tips keamanan, dark/light auto; host dinamis dari `?domain=` (Sidebar sudah kirim `domain=user.email.split('@')[1]`).
- **Fix:** field email login diberi `autoFocus` (efek fokus lama kadang tak jalan di lazy load).
- **Verifikasi:** `curl .com & .co.id /webmail/help/email-settings.html?domain=pcpexpress.com` → 200 ✅; host `mail.pcpexpress.com` ter-render ✅; push `8bfab37`.

## 2026-08-17 — Round 9.2: login NetworkError di mail.pcpexpress.com → SOGO_BASE same-origin

- **Bug:** Di `https://mail.pcpexpress.com/webmail/login` muncul "NetworkError when attempting to fetch resource" saat login. Root cause: `VITE_SOGO_BASE_URL` di-hardcode `https://mail.pcpexpress.co.id` (deploy.sh default) → halaman `.com` fetch `/SOGo/*` cross-origin ke `.co.id` → diblokir CORS (respon SOGo tanpa `Access-Control-Allow-Origin`) + CSP `connect-src 'self'` → NetworkError.
- **Fix:** `SOGO_BASE` default relatif/same-origin di `src/lib/api.js` + `src/components/mailer/MessageReader.jsx` (`VITE_SOGO_BASE_URL || ''`); deploy.sh default `VITE_SOGO_BASE_URL` jadi kosong; `.env.production.example` diupdate. Env override tetap dihormati bila SPA di origin terpisah.
- **Verifikasi:** cert SAN kedua domain sudah termasuk `mail.pcpexpress.com` ✅; nginx mem-proxy `/SOGo` di kedua vhost (curl 403 tanpa kredensial = SOGo merespons) ✅; bundle ter-deploy 0 referensi `mail.pcpexpress.co.id/SOGo` ✅.
- **Validasi:** build ✅, test ✅, bash -n ✅, webmail HTTP 200 ✅, push `739a150`.

## 2026-08-17 — Round 9.1: harden folder tree + error capture

- **Bug (user report):** "Maaf, terjadi kesalahan yang tidak terduga" — ErrorBoundary generik setelah deploy tree; error asli disembunyikan di prod (keputusan keamanan).
- **Fix:** (a) hardening tree — `folderPathOf()` paksa string + guard `Array.isArray(folders)` (SOGo pernah kirim field object); (b) ErrorBoundary simpan error terakhir ke `localStorage.pcp_last_error` (tidak tampil ke layar; diambil via console utk debugging).
- **Status:** menunggu konfirmasi user — kalau error masih muncul, ambil `localStorage.getItem('pcp_last_error')`.

## 2026-08-17 — Round 9: sidebar folder expand/collapse (tree)

- **Fitur:** Sidebar folder kini tree expand/collapse. Chevron (ChevronDown/ChevronRight) di folder ber-anak; klik = toggle; default semua expanded (migrasi mulus dari tampilan flat). Anak ter-render rekursif hanya saat parent terbuka.
- **Impl:** `childrenByParent` (useMemo) — peta anak-per-parent dari daftar flat via id parent = `'folder' + path-tanpa-segmen-terakhir (encode %2F)`; `collapsedFolders` (Set) + `toggleCollapsed`; `renderFolderRow` rekursif menggantikan `.map()` lama; indent depth 16px/level dipindah ke kontainer baris.
- **Scope:** sidebar MailPage (desktop + panel folder mobile). Move dropdown & RulesPage tetap daftar flat — tidak diminta.
- **Validation:** 14/14 test PASS | build ✅ | simulasi tree dgn hierarki Dovecot asli: INBOX default expanded (subfolder + nested Backup report/e-kas dll.), collapse INBOX → subtree hilang ✅.

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

## 2026-08-18T02:33:56Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T02:59:14Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T03:15:00Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T03:51:24Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T03:57:13Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T04:32:10Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T04:41:44Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md

## 2026-08-18T05:11:26Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T05:29:53Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T05:35:52Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T05:37:54Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T05:47:11Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T05:54:55Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js

## 2026-08-18T06:03:27Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js
- ?? src/lib/snooze.js

## 2026-08-18T06:06:36Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js
- ?? src/lib/snooze.js

## 2026-08-18T06:16:10Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M scripts/test-message-api.mjs
-  M scripts/test-message-requests.mjs
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/lib/messageRequests.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js
- ?? src/lib/snooze.js

## 2026-08-18T06:22:17Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M scripts/test-message-api.mjs
-  M scripts/test-message-requests.mjs
-  M src/components/HtmlEditor.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/lib/messageRequests.js
-  M src/pages/LoginPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? src/lib/emailCategory.js
- ?? src/lib/signatures.js
- ?? src/lib/snooze.js

## 2026-08-18T07:30:46Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M src/components/mailer/MessageReader.jsx
-  M src/pages/CalendarPage.jsx
-  M src/pages/MailPage.jsx
-  M src/pages/RulesPage.jsx
- ?? src/lib/dateGroups.js

## 2026-08-18T10:13:20Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-18T12:37:56Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md

## 2026-08-18T13:28:14Z
- Status: COMPLETED
- Objective: T-BUGHUNT: Comprehensive bug hunt loop — all features sogo-frontend
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/autoArchive.js
-  M src/pages/MailPage.jsx
-  M src/pages/RulesPage.jsx
- ?? docs/ai/tasks/20260818-125516-114124.previous.md

## 2026-08-18T14:29:24Z
- Status: COMPLETED
- Objective: T-BUGHUNT-ROUND2: Bug hunt loop — regressions + deep audit
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-18T14:45:38Z
- Status: COMPLETED
- Objective: T-BUGHUNT-ROUND2: Bug hunt loop — regressions + deep audit
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-18T14:54:21Z
- Status: COMPLETED
- Objective: T-BUGHUNT-ROUND2: Bug hunt loop — regressions + deep audit
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-18T15:00:54Z
- Status: COMPLETED
- Objective: T-BUGHUNT-ROUND2: Bug hunt loop — regressions + deep audit
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-18T16:08:05Z
- Status: COMPLETED
- Objective: T-BUGHUNT-ROUND2: Bug hunt loop — regressions + deep audit
- Branch: main
- Changed Files:
-  M ai-state.json

## 2026-08-19 — 3 fitur DEPLOYED (commit 200b250)

**Done:** spam native SOGo per-message + bulk (markMessagesAsJunk), fix lampiran (parts ARRAY root cause + size string), subfolder create/delete UI (createFolder/deleteFolder + dialog modal). Build OK, tests PASS, deployed via ./deploy.sh (HTTP 200), pushed ke GitLab main.

**Next:** verifikasi live manual — tombol spam, lampiran, subfolder. Kredensial test stale (403 LDAPPasswordPolicyError 65535); perlu kredensial segar.

## 2026-08-19T10:30:43Z
- Status: COMPLETED
- Objective: Webmail: hapus draft di daftar + infinite scroll 5 bulan inbox + lampiran smart (ikon tipe, unduh semua blob, total ukuran)
- Summary: 3 fitur follow-up webmail: (1) tombol hapus draft di daftar (hover desktop), (2) infinite scroll Kotak Masuk + batas 5 bulan terakhir, (3) lampiran smart — ikon per tipe file, unduh semua via blob (tanpa banyak tab), total ukuran header. Build OK + test:attachments PASS.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M src/components/mailer/MessageReader.jsx
-  M src/pages/MailPage.jsx
- ?? docs/ai/tasks/20260819-103030-365882.previous.md
- ?? src/lib/attachments.js

## 2026-08-19T10:45:22Z
- Status: COMPLETED
- Objective: Webmail: preview gambar/PDF dalam lightbox saat klik lampiran
- Summary: Preview gambar/PDF dalam lightbox: klik gambar → lightbox full-screen (img), klik PDF → lightbox iframe (PDF viewer browser). Tombol Unduh (blob), Tab baru (fallback), Tutup (X/klik luar/Esc). Esc nutup lightbox dulu sebelum menutup reader. extractAttachments simpan viewURL terpisah utk preview. Build OK.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M src/components/mailer/MessageReader.jsx
- ?? docs/ai/tasks/20260819-104513-330340.previous.md

## 2026-08-19T11:00:07Z
- Status: COMPLETED
- Objective: Webmail: filter email berlampiran + rapikan seksi lampiran (hapus Gambar, hormati shouldDisplayAttachment)
- Summary: Filter email berlampiran (toggle Paperclip di header list) + rapikan seksi lampiran: hapus seksi 'Gambar' (inline images) yang bikin tampak 2 grup, extractAttachments hormati shouldDisplayAttachment=false (gambar inline CID tidak masuk daftar Lampiran). Build OK.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M src/components/mailer/MessageReader.jsx
-  M src/pages/MailPage.jsx
- ?? docs/ai/tasks/20260819-105957-306646.previous.md

## 2026-08-19T13:08:29Z
- Status: COMPLETED
- Objective: Webmail frontend: bug & vulnerability hunt (OWASP minimum) — security audit + hardening
- Summary: OWASP security audit + hardening webmail frontend: (1) fix ErrorBoundary info disclosure — error.message + componentStack dirender lagi ke user (regresi dari fix Round 3), sekarang detail hanya di console/localStorage; (2) CSP hardening nginx+server.js: object-src 'none', frame-src 'self', worker-src 'self', header Permissions-Policy; (3) log hygiene api.js fetchPreferences console.warn→debugWarn; (4) restore 5 test files hilang (email-category, signatures, draft-api, snooze, date-groups) + un-ignore scripts/test-*.mjs di .gitignore. Validasi: npm audit 0 vuln, build OK, 21/21 test PASS.
- Branch: main
- Changed Files:
-  M .gitignore
-  M ai-state.json
-  M configs/site.webmail.custom
-  M docs/ai/current-task.md
-  M server.js
-  M src/components/ErrorBoundary.jsx
-  M src/lib/api.js
- ?? docs/ai/tasks/20260819-130705-700312.previous.md
- ?? scripts/test-date-groups.mjs
- ?? scripts/test-draft-api.mjs
- ?? scripts/test-email-category.mjs
- ?? scripts/test-signatures.mjs
- ?? scripts/test-snooze.mjs

## 2026-08-19T13:47:29Z
- Status: COMPLETED
- Objective: Webmail: commit+push+deploy akumulasi hardening keamanan (OWASP audit, image-proxy anti tracking-pixel, server.js rate-limit/session) + sinkron deploy.sh nginx config
- Summary: Commit+push+deploy akumulasi hardening keamanan webmail: OWASP audit (ErrorBoundary info-disclosure, CSP), image-proxy anti tracking-pixel (SSRF guard), server.js rate-limit/session hardening, dan sinkron deploy.sh nginx config. Validasi 14/14 test, build OK.
- Branch: main
- Changed Files:
-  M .gitignore
-  M ai-state.json
-  M configs/site.webmail.custom
-  M deploy.sh
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M docs/ai/next-tasks.md
-  M package.json
-  M server.js
-  M src/components/ErrorBoundary.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
- ?? docs/ai/tasks/20260819-130705-700312.previous.md
- ?? scripts/test-date-groups.mjs
- ?? scripts/test-draft-api.mjs
- ?? scripts/test-email-category.mjs
- ?? scripts/test-email-validation.mjs
- ?? scripts/test-image-proxy.mjs
- ?? scripts/test-signatures.mjs
- ?? scripts/test-snooze.mjs
- ?? scripts/test-ssrf-guard.mjs
- ?? src/lib/emailValidation.js
- ?? src/lib/imageProxy.js
- ?? src/lib/ssrfGuard.js

## 2026-08-19T14:13:57Z
- Status: COMPLETED
- Objective: Webmail: refactor deploy.sh — nginx config single-source (baca configs/site.webmail.custom) + deploy backend server.js otomatis
- Summary: Refactor deploy.sh: setup_nginx() kini membaca configs/site.webmail.custom sebagai single source of truth (hapus heredoc hardcoded yang berisiko drift/revert hardening), dan tambah deploy_backend() yang men-sync server.js + src/lib/{ssrfGuard,emailValidation}.js lalu restart sogo-smtp-proxy — dengan change-detection md5 agar deploy frontend-only tidak menjatuhkan sesi SMTP in-memory. Deploy idempotent diverifikasi live (skip backend, HTTP 200).
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M scripts/test-nginx-routes.mjs
- ?? docs/ai/tasks/20260819-140923-110737.previous.md

## 2026-08-19T14:17:46Z
- Status: COMPLETED
- Objective: Webmail: deploy.sh verify() tambah health-check /api/image-proxy (SSRF guard + smoke test gambar eksternal)
- Summary: deploy.sh verify() kini juga memvalidasi /api/image-proxy live: (1) SSRF guard deterministik — request URL internal 127.0.0.1 wajib 403; (2) smoke test gambar eksternal (200 image/*) non-fatal (warn). Tambah fungsi warn() + warna YELLOW yang sebelumnya dipakai tanpa definisi (latent bug), dan helper webmail_host() agar host diambil dari WEBMAIL_URL bukan hardcoded. Deploy live diverifikasi: SSRF 403 + gambar 200 image/png.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M scripts/test-nginx-routes.mjs
- ?? docs/ai/tasks/20260819-141730-202327.previous.md

## 2026-08-19T14:22:30Z
- Status: COMPLETED
- Objective: Webmail: documentation currency G-001.S-002 — reconcile docs/ai dgn state deploy terkini (deploy-mail LIVE, image-proxy, backend deploy otomatis)
- Summary: Documentation currency G-001.S-002: reconcile docs/ai dgn state terkini. project-context/application-map/goals/decisions diperbarui — hapus klaim usang 'deploy BLOCKED/NOT LIVE karena mailserver tidak resolve' (kini LIVE via SSH alias deploy-mail), tambah endpoint /api/image-proxy + security controls (SSRF guard, email validation, CSP fail-closed), deploy mechanics single-source nginx + backend deploy otomatis, dan sub-goal G-001.S-009 (security hardening 08-19). Entry historis decisions.md dipertahankan sebagai audit history (ditandai superseded).
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/application-map.md
-  M docs/ai/current-task.md
-  M docs/ai/decisions.md
-  M docs/ai/goals.md
-  M docs/ai/project-context.md
- ?? docs/ai/tasks/20260819-142017-382878.previous.md

## 2026-08-19T14:26:55Z
- Status: COMPLETED
- Objective: Webmail: perluas proxyExternalImages — srcset, <picture><source>, CSS background-image/url()
- Summary: Perluas proxyExternalImages: kini menangani <img srcset> + <source srcset> (rewriteSrcset — pertahankan whitespace + descriptor, skip kandidat data:/relatif) dan CSS url(...) pada inline style attribute + <style> block (rewriteCssUrls — dukung quote single/double/tanpa, skip data:/relatif). Vektor srcset/<picture>/CSS background-image yang sebelumnya hanya diblokir CSP kini di-rewrite aktif: gambar tetap tampil via proxy DAN IP tetap aman. 15/15 test PASS, build OK.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-image-proxy.mjs
-  M src/lib/imageProxy.js
- ?? docs/ai/tasks/20260819-142636-337630.previous.md

## 2026-08-19T14:38:25Z
- Status: COMPLETED
- Objective: Webmail: test otomatis anti tracking-pixel (linkedom) — simulasi render email & assert tidak ada request langsung ke domain pengirim
- Summary: Test otomatis anti tracking-pixel: tambah scripts/test-tracking-pixel.mjs pakai linkedom (devDependency). Simulasi email tracking-pixel lengkap (img src, img srcset, picture/source, CSS background-image inline + style block) → jalankan proxyExternalImages ASLI → assert 0 URL eksternal tersisa (semua jadi /api/image-proxy) + round-trip decode. Refactor proxyExternalImages: doc injectable (default global document) + wrapper <div> karena getter innerHTML <template> di linkedom tidak merefleksikan mutasi content. 16/16 test PASS, build OK.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package-lock.json
-  M package.json
-  M src/lib/imageProxy.js
- ?? docs/ai/tasks/20260819-143808-382111.previous.md
- ?? scripts/test-tracking-pixel.mjs

## 2026-08-19T14:56:49Z
- Status: COMPLETED
- Objective: Webmail: ai-loop bug hunt — fix slow-loris image-proxy + duplicate-send fallback SMTP
- Summary: ai-loop bug hunt: (1) image proxy rentan slow-loris/slow-read — socket idle timeout saja tidak cukup (byte dikirim <10s sekali menahan koneksi tak terbatas); fix hard deadline absolut untuk seluruh fetch + destroy stream. (2) sendMessage fallback SMTP pada SEMUA non-ok SOGo berisiko kirim ganda (SOGo memproses lalu error); kini fallback hanya pada 501. Validasi 16/16 test + build OK.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-draft-api.mjs
-  M server.js
-  M src/lib/api.js
- ?? docs/ai/tasks/20260819-145627-255339.previous.md

## 2026-08-19T15:06:15Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M scripts/test-draft-api.mjs
-  M scripts/test-preferences-fallback.mjs
-  M server.js
-  M src/App.jsx
-  M src/components/layout/Sidebar.jsx
-  M src/components/mailer/ComposeModal.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/pages/LoginPage.jsx
-  M src/pages/PreferencesPage.jsx
-  M src/store/authStore.js
- ?? docs/ai/tasks/20260819-150558-273339.previous.md
- ?? scripts/test-smtp-cookie.mjs
- ?? src/lib/smtpCookie.js

## 2026-08-19T15:15:17Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M package.json
-  M src/lib/pasteUtils.js
- ?? docs/ai/tasks/20260819-151451-148560.previous.md
- ?? scripts/test-purify-hardening.mjs

## 2026-08-19T15:21:04Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M package.json
-  M server.js
- ?? docs/ai/tasks/20260819-152048-151547.previous.md
- ?? scripts/test-remote-image.mjs
- ?? src/lib/remoteImage.js

## 2026-08-19T15:26:26Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M docs/ai/goals.md
-  M docs/ai/handoff.md
-  M docs/ai/next-tasks.md
- ?? docs/ai/tasks/20260819-152539-885255.previous.md

## 2026-08-20T10:05:21Z
- Status: COMPLETED
- Objective: Webmail: implementasi lampiran di ComposeModal (create/reply) + dukungan attachments di /api/send
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M package.json
-  M scripts/test-draft-api.mjs
-  M server.js
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/api.js
-  M src/lib/dateGroups.js
- ?? docs/ai/tasks/20260820-100501-388715.previous.md
- ?? scripts/test-attachment-validation.mjs
- ?? src/lib/attachmentValidation.js

## 2026-08-20T10:49:59Z
- Status: COMPLETED
- Objective: Webmail: perbaiki kalender tidak bisa buat event (action name + field iCal SOGo salah)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M src/lib/api.js
- ?? docs/ai/tasks/20260820-104931-250388.previous.md
- ?? scripts/test-calendar-api.mjs

## 2026-08-20T10:56:23Z
- Status: COMPLETED
- Objective: Webmail: edit detail event kalender via /view (isi lengkap: attendees + classification)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-calendar-api.mjs
-  M src/components/EventModal.jsx
-  M src/lib/api.js
-  M src/pages/CalendarPage.jsx
- ?? docs/ai/tasks/20260820-105602-244471.previous.md

## 2026-08-20T11:01:37Z
- Status: COMPLETED
- Objective: Webmail: dukungan recurring event di EventModal (repeat SOGo)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-calendar-api.mjs
-  M src/components/EventModal.jsx
-  M src/lib/api.js
- ?? docs/ai/tasks/20260820-110117-165829.previous.md

## 2026-08-20T11:05:26Z
- Status: COMPLETED
- Objective: Webmail: ikon pengulangan (↻) pada event berulang di grid kalender
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-calendar-api.mjs
-  M src/lib/api.js
-  M src/pages/CalendarPage.jsx
- ?? docs/ai/tasks/20260820-110511-162155.previous.md

## 2026-08-20T11:12:56Z
- Status: COMPLETED
- Objective: Webmail: weekly repeat day picker + hari kerja saja
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-calendar-api.mjs
-  M src/components/EventModal.jsx
- ?? docs/ai/tasks/20260820-111241-959627.previous.md

## 2026-08-20T11:44:30Z
- Status: COMPLETED
- Objective: Webmail: auto-load kotak masuk saat scroll (server-side /headers, lewati batas 100)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-message-api.mjs
-  M src/lib/api.js
-  M src/pages/MailPage.jsx
- ?? docs/ai/tasks/20260820-114411-136241.previous.md

## 2026-08-20T12:51:05Z
- Status: COMPLETED
- Objective: Webmail: indikator jumlah email yang sedang dimuat saat auto-load
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M src/pages/MailPage.jsx
- ?? docs/ai/tasks/20260820-125059-377940.previous.md

## 2026-08-20T12:53:40Z
- Status: COMPLETED
- Objective: Webmail: verifikasi auto-load universal (Sent/Drafts/Junk/Trash)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M scripts/test-message-api.mjs
-  M src/pages/MailPage.jsx
- ?? docs/ai/tasks/20260820-125333-305684.previous.md

## 2026-08-20T12:57:04Z
- Status: COMPLETED
- Objective: Webmail: auto-logout saat sesi SMTP proxy berakhir; TTL 8 jam dipertahankan
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M src/lib/api.js
- ?? docs/ai/tasks/20260820-125654-156816.previous.md
- ?? scripts/test-smtp-session-expired.mjs

## 2026-08-20T13:14:38Z
- Status: COMPLETED
- Objective: Webmail: countdown sesi SMTP di Sidebar saat tinggal <15 menit
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M server.js
-  M src/components/layout/Sidebar.jsx
-  M src/lib/api.js
- ?? docs/ai/tasks/20260820-131428-282178.previous.md
- ?? scripts/test-session-countdown.mjs
- ?? src/lib/sessionCountdown.js

## 2026-08-20T13:18:22Z
- Status: COMPLETED
- Objective: Webmail: idle timeout SMTP 30→60 menit via SMTP_SESSION_IDLE_MIN (.env + service unit)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M configs/sogo-smtp-proxy.service
-  M docs/ai/current-task.md
- ?? docs/ai/tasks/20260820-131813-225244.previous.md

## 2026-08-20T13:27:52Z
- Status: COMPLETED
- Objective: deploy.sh: ensure_runtime_env idempotent utk SMTP_SESSION_IDLE_MIN (.env di server)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M deploy.sh
-  M docs/ai/current-task.md
-  M package.json
- ?? docs/ai/tasks/20260820-132742-138659.previous.md

## 2026-08-20T13:31:36Z
- Status: COMPLETED
- Objective: Webmail: heartbeat SMTP tiap 50 mnt hanya saat tab aktif (idle reset jadi true-tab-inactive)
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M package.json
-  M src/components/layout/AppLayout.jsx
-  M src/components/layout/Sidebar.jsx
- ?? docs/ai/tasks/20260820-133121-262175.previous.md
- ?? scripts/test-smtp-heartbeat.mjs
- ?? src/components/SmtpHeartbeat.jsx
- ?? src/lib/smtpHeartbeat.js

## 2026-08-20T13:35:46Z
- Status: COMPLETED
- Objective: Pantau 1-2 mnt: /api/health + 401 dari /api/send; bump idle 90/120 mnt via .env bila perlu
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M server.js
- ?? docs/ai/tasks/20260820-133521-293553.previous.md
- ?? scripts/monitor-smtp.sh

## 2026-08-20T13:40:24Z
- Status: COMPLETED
- Objective: Webmail: favicon envelope (SVG) + apple-touch-icon meta
- Branch: main
- Changed Files:
-  M ai-state.json
-  M docs/ai/current-task.md
-  M index.html
- ?? docs/ai/tasks/20260820-134013-202650.previous.md
- ?? public/favicon.svg

## 2026-08-21 — Settings crash fix (legacy signature tanpa html) — DONE + siap deploy

- **Gejala:** /webmail/settings menampilkan "Terjadi Kesalahan" (ErrorBoundary root). Seluruh tab Settings mati.
- **Root cause (terkonfirmasi):** SignatureSection memanggil `sig.html.length` tanpa guard. Entri signature LEGACY di localStorage (`pcp_signatures_<email>`) dari versi pra-multi-signature bisa `{ id, name }` tanpa `html` → `TypeError: Cannot read properties of undefined (reading 'length')` → crash seluruh halaman saat tab Signature dirender.
- **Cara konfirmasi:** (1) deployed chunk PreferencesPage-D2kJ66t5.js == build HEAD persis setelah normalisasi nama chunk (beda hanya VITE_SOGO_BASE_URL karena deploy override). (2) Semua chunk live serve 200. (3) Repro jsdom `scripts/test-settings-signature.mjs`: seed signature legacy + klik tab → reproduksi crash persis.
- **Fix:** guard optional chaining di render + normalisasi entri di `loadSignatures` (coerce name/html ke string, filter id non-string/non-object) → melindungi semua consumer (ComposeModal/MessageReader). + `SectionErrorBoundary` per-tab (defense-in-depth, pesan generik — konsisten dgn keputusan keamanan no-error-disclosure).
- **Test:** 35/35 PASS (baru `test:settings-signature` jsdom end-to-end + unit test legacy di `test:signatures`). `jsdom@30` jadi devDependency.
- **Catatan deploy:** frontend-only (PreferencesPage, signatures, package.json, test). `VITE_SOGO_BASE_URL=""` override deploy = same-origin (benar utk domain .com).

## 2026-08-21T09:29:56Z
- Status: COMPLETED
- Objective: Fix halaman /webmail/settings yang menampilkan "Terjadi Kesalahan" (ErrorBoundary root)
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package-lock.json
-  M package.json
-  M scripts/test-signatures.mjs
-  M src/lib/signatures.js
-  M src/pages/PreferencesPage.jsx
- ?? scripts/test-settings-signature.mjs

## 2026-08-21 — Audit normalisasi data localStorage/API (pola loadSignatures) — DONE + siap deploy

- **Permintaan:** lanjutan fix crash Settings — audit semua akses data tanpa guard, tambah normalisasi serupa.
- **getRules (autoArchive) [HIGH]:** JSON.parse mentah → non-array crash RulesPage (`rules.map`), value non-string crash matchRules (`c.value.trim()`). Kini filter + normalisasi penuh di source.
- **loadPrefsFromLocal (api.js):** cache `sogo_prefs_<email>` non-object → `{defaults:{},settings:{}}`.
- **fetchContacts (api.js):** baris non-array dibuang (pola parseMessageRow).
- **loadSnoozes (snooze.js):** nilai → number; null/true/NaN dibuang (Number(null)=0 menjebak).
- **flattenMailboxes (mailboxTree.js):** entri null dilewati, path/name String()-coerced.
- **flagColors getStore:** JSON null/array/string → {}.
- **Sudah aman:** parseMessageRows, fetchCalendarEvents, userPrefs, MessageReader/ComposeModal (?.html), StatsPage.
- **Test:** 36/36 PASS (baru test:autoarchive; diperluas test:snooze, test:mailbox-tree, test:preferences-fallback).
- **Pelajaran:** polanya sama di semua modul storage — baca JSON mentah lalu konsumen render akses field → TypeError. Normalisasi di source reader + unit test legacy data = pola wajib.

## 2026-08-21T09:38:37Z
- Status: COMPLETED
- Objective: Audit semua akses data localStorage/API yang tanpa guard di seluruh halaman dan
tambahkan normalisasi serupa (pola loadSignatures) — lanjutan dari fix crash
Settings (signature legacy tanpa html).
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M scripts/test-mailbox-tree.mjs
-  M scripts/test-preferences-fallback.mjs
-  M scripts/test-snooze.mjs
-  M src/lib/api.js
-  M src/lib/autoArchive.js
-  M src/lib/flagColors.js
-  M src/lib/mailboxTree.js
-  M src/lib/snooze.js
- ?? scripts/test-autoarchive.mjs

## 2026-08-21 — Tombol debug ErrorBoundary (detail error opt-in tanpa devtools) — DONE + siap deploy

- **ErrorBoundary root:** tombol toggle "Lihat Detail Error"/"Sembunyikan Detail" — pesan error + stack + componentStack dalam <pre> scrollable. Default tetap tersembunyi (keputusan keamanan dipertahankan); componentDidUpdate reset saat error baru.
- **SectionErrorBoundary (PreferencesPage):** toggle yang sama untuk konsistensi.
- **Test:** `test:error-boundary-debug` — bundle komponen nyata via esbuild + jsdom, assert perilaku toggle (default hidden → klik tampil → klik lagi hidden). esbuild jadi devDependency.
- **Catatan:** teknik bundle komponen utk unit test (esbuild stdin + data: URL import + jsdom) berguna utk komponen JSX apa pun yang belum punya test runner.
- **Validasi:** 37/37 test PASS, build OK.

## 2026-08-21T09:43:41Z
- Status: COMPLETED
- Objective: Tambah tombol debug di ErrorBoundary root agar pemilik akun bisa melihat detail
error tanpa buka devtools.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package-lock.json
-  M package.json
-  M src/components/ErrorBoundary.jsx
-  M src/pages/PreferencesPage.jsx
- ?? scripts/test-error-boundary-debug.mjs

## 2026-08-21 — Migrasi sekali-jalan signature legacy (placeholder) — DONE + siap deploy

- **loadSignatures:** entri legacy (html hilang / bukan string) → placeholder `<p>Ketik signature Anda di sini…</p>` + flag `placeholder:true`, ditulis balik ke localStorage (idempotent). updateSignature hapus flag saat user isi html eksplisit.
- **Anti-terkirim:** ComposeModal + syncToSogo (PreferencesPage) skip placeholder — placeholder tidak ikut disuntik ke email baru/balasan maupun ke SOGo. Diverifikasi: MessageReader sudah tidak konsumsi getSignatureFor (refactor sebelumnya) — satu-satunya konsumen injeksi adalah ComposeModal.
- **UI:** daftar menampilkan badge "Perlu diisi — klik untuk mengedit" utk entri placeholder (bukan "0.0 KB — teks saja").
- **Test:** test:signatures (migrasi+write-back+idempotent+flag clear) & test:settings-signature (badge end-to-end). 37/37 PASS.

## 2026-08-21T09:48:19Z
- Status: COMPLETED
- Objective: Migrasi sekali-jalan di loadSignatures: signature legacy yang kosong html diberi
placeholder agar tidak tampil aneh di daftar.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M scripts/test-settings-signature.mjs
-  M scripts/test-signatures.mjs
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/signatures.js
-  M src/pages/PreferencesPage.jsx

## 2026-08-21 — Rollout pola write-back migrasi ke semua modul storage — DONE + siap deploy

- **Pola:** tiap reader storage kini menulis balik hasil normalisasi ke localStorage HANYA saat bentuk berubah (deteksi: JSON.stringify compare utk list kecil / flag `changed` saat loop) → idempotent, satu kali pembersihan.
- **Cakupan:** loadSnoozes (nilai numeric dipersist; bentuk rusak → {}), getStore flagColors (prune warna tidak dikenal → write-back), getRules autoArchive (persist hasil normalisasi; non-array → []), loadPrefsFromLocal api.js (cache rusak → {defaults:{},settings:{}}), loadPrefs userPrefs (field hilang → default; array/non-object → null tanpa tulis).
- **Catatan:** userPrefs sengaja TIDAK menulis untuk bentuk array/non-object (kontrak null = "belum ada preferensi" dipertahankan) — berbeda dari snooze/flagColors yang menulis {} — konsisten dgn semantik masing-masing consumer.
- **Test:** baru test:flag-colors; diperluas test:snooze/autoarchive/preferences-fallback/user-prefs. 38/38 PASS.

## 2026-08-21T10:02:31Z
- Status: COMPLETED
- Objective: Terapkan pola migrasi write-back (pola loadSignatures/LEGACY_PLACEHOLDER) ke
modul storage lain yang menyimpan bentuk lama: snooze, flagColors, rules,
prefs cache (api.js), userPrefs.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M scripts/test-autoarchive.mjs
-  M scripts/test-preferences-fallback.mjs
-  M scripts/test-snooze.mjs
-  M scripts/test-user-prefs.mjs
-  M src/lib/api.js
-  M src/lib/autoArchive.js
-  M src/lib/flagColors.js
-  M src/lib/snooze.js
-  M src/lib/userPrefs.js
- ?? scripts/test-flag-colors.mjs

## 2026-08-21 — Audit konsumen signature: placeholder ditangani di semua titik — DONE + siap deploy

- **Verifikasi menyeluruh:** konsumen getSignatureFor/getSignatureById/loadSignatures hanya di PreferencesPage + ComposeModal. MessageReader/quick-reply sudah tidak pakai signature.
- **Titik baru yang diperbaiki:** SignaturePicker di ComposeModal menyisipkan `s.html` saat diklik — entri placeholder kini di-filter (`!s.placeholder`) agar teks panduan tidak ikut terkirim. Dead import `getSignatureById` dihapus.
- **Kontrak terdokumentasi di test:** `getSignatureFor` mengembalikan entri placeholder dengan flag → konsumen wajib skip (auto-inject ✓, syncToSogo ✓, picker ✓, daftar Settings badge ✓).
- **Validasi:** 38/38 PASS, build OK, test end-to-end Settings PASS.

## 2026-08-21T10:05:53Z
- Status: COMPLETED
- Objective: Cek ulang SEMUA konsumen getSignatureFor/getSignatureById/loadSignatures untuk
memastikan flag `placeholder` (migrasi signature legacy) ditangani di mana pun
dibutuhkan.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M scripts/test-signatures.mjs
-  M src/components/mailer/ComposeModal.jsx

## 2026-08-21 — Helper bersama storageMigrate.js (DRY pola write-back) — DONE + siap deploy

- **Helper baru `src/lib/storageMigrate.js`:** `readJSON` (baca+parse, null utk missing/rusak), `writeJSON` (tulis guarded, true bila tertulis), `writeIfChanged` (tulis HANYA saat bentuk beda — idempotent).
- **Refactor 6 modul** ke helper: signatures (writeJSON via flag migrated), snooze (writeJSON via flag changed + bentuk rusak), flagColors (writeJSON prune + bentuk rusak), autoArchive (writeIfChanged + writeJSON []), api.js loadPrefsFromLocal (writeIfChanged), userPrefs loadPrefs (writeIfChanged).
- **Perubahan perilaku disengaja:** JSON literal `'null'` tersimpan = "tidak ada data" (readJSON → null) — tidak lagi ditulis ulang jadi {} / []. Nilai yg dikembalikan konsumen identik; hanya pembersihan literal-null yang tidak dilakukan. Test disesuaikan (pembersihan tetap diuji utk bentuk rusak yg bisa di-parse).
- **Test:** baru test:storage-migrate (termasuk simulasi setItem gagal → false tanpa throw). 39/39 PASS.

## 2026-08-21T10:10:41Z
- Status: COMPLETED
- Objective: Buat helper bersama `src/lib/storageMigrate.js` agar pola baca + write-back
migrasi idempotent tidak diulang manual di tiap modul storage.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M scripts/test-flag-colors.mjs
-  M scripts/test-preferences-fallback.mjs
-  M scripts/test-snooze.mjs
-  M src/lib/api.js
-  M src/lib/autoArchive.js
-  M src/lib/flagColors.js
-  M src/lib/signatures.js
-  M src/lib/snooze.js
-  M src/lib/userPrefs.js
- ?? scripts/test-storage-migrate.mjs
- ?? src/lib/storageMigrate.js

## Handoff — versi skema localStorage (pcp_*_v2)

**Task:** Tambah versi skema pada tiap key localStorage agar migrasi berikutnya
terdeteksi lebih mudah. **SELESAI & LIVE** (39/39 test PASS, build OK).

### Yang berubah
- `src/lib/storageMigrate.js`: helper `STORAGE_VERSION` (2), `storageKey()`,
  `readStorage()` (fallback chain baca v2 → v1, `fromLegacy`), `removeJSON()`,
  `persistNormalized()` (migrasi key + write-back idempotent).
- 6 modul dimigrasi ke key `*_v2_*` dengan fallback baca v1 + pemindahan
  sekali-jalan: `signatures`, `snooze`, `flagColors`, `autoArchive` (rules),
  `api.js` (cache prefs `sogo_prefs_v2_`), `userPrefs`.
- Key v1 dihapus HANYA setelah tulis v2 sukses (quota → v1 dipertahankan utk
  migrasi ulang). Idempotent: data valid tidak pernah ditulis ulang.

### Test
- `test:storage-migrate` diperluas: storageKey, readStorage fallback v2→v1,
  persistNormalized (migrasi, idempotent, quota-gagal).
- Semua test storage di-update ke pola seed-v1/assert-v2. e2e
  `test-settings-signature` tetap seed v1 (uji migrasi nyata di bundle).
- 39/39 PASS.

### Deploy
- Commit → push origin/main → `SERVER=deploy-mail ./deploy.sh`.

### Next task suggestion
- Pantau seminggu: cek console error browser (key lama tidak ter-baca /
  migrasi ganda) & 401/500 di log server. Bila ada domain storage baru,
  wajib pakai `readStorage`/`persistNormalized` + unit test legacy.

## 2026-08-21T10:18:53Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M scripts/test-autoarchive.mjs
-  M scripts/test-flag-colors.mjs
-  M scripts/test-preferences-fallback.mjs
-  M scripts/test-signatures.mjs
-  M scripts/test-snooze.mjs
-  M scripts/test-storage-migrate.mjs
-  M scripts/test-user-prefs.mjs
-  M src/lib/api.js
-  M src/lib/autoArchive.js
-  M src/lib/flagColors.js
-  M src/lib/signatures.js
-  M src/lib/snooze.js
-  M src/lib/storageMigrate.js
-  M src/lib/userPrefs.js

## Handoff — sanitasi jalur kirim email (defense-in-depth)

**Task:** Pastikan body compose selalu melalui DOMPurify sebelum dikirim.
**SELESAI & LIVE** (40/40 test PASS, build OK).

### Temuan audit
- Jalur: `ComposeModal.handleSend` (sudah `DOMPurify.sanitize` utk mode rich)
  → `sendMessage()` → `/api/send` (SMTP proxy) / SOGo `/send` / fallback SMTP.
- Gap: `sendMessage` (chokepoint) tidak menyanitasi ulang — satu-satunya
  pemanggil saat ini adalah ComposeModal, tapi jalur masa depan rentan.

### Perubahan
- `src/lib/api.js` `sendMessage`: `safeBody = isHTML && DOMPurify?.isSupported
  ? DOMPurify.sanitize(body, PURIFY_CONFIG) : body` — dipakai di ketiga jalur
  kirim. Guard isSupported utk Node/test tanpa DOM.
- Import DOMPurify + PURIFY_CONFIG di api.js (tidak ada circular dependency).
- `scripts/test-send-sanitize.mjs` (baru, `test:send-sanitize`): jsdom +
  mock fetch — assert script/onerror/javascript:/data: href hilang,
  rel=noopener dipaksa, konten sah dipertahankan, plain text tidak diubah,
  fallback 501 ter-sanitize, body kosong tidak crash.

### Deploy
- Commit → push origin/main → `SERVER=deploy-mail ./deploy.sh`.

### Next task suggestion
- Pantau log `/api/send` seminggu: cek 4xx tak biasa (Zod/rate-limit) — kalau
  ada, periksa apakah payload body memuat HTML mentah dari jalur non-editor.

## 2026-08-21T10:24:14Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/lib/api.js
- ?? scripts/test-send-sanitize.mjs

## 2026-08-25 — Bug hunt menyeluruh (flow/UI-UX/PC+mobile/fitur/security) — 6 bug fixed

Implement: Buffy · Review: self-review + bug-hunt passes (flow → edge → UI/UX → security)

### Temuan & fix (semua diuji)
1. **Crash formatAddresses** (MessageReader): item array null/string dari SOGo → TypeError crash seluruh reader. Dipindah ke `src/lib/format.js`, normalisasi lengkap (null dilewati, string apa adanya, objek dirangkai). `test:format` (14 kasus).
2. **Keyboard double-fire**: MailPage + MessageReader sama-sama listen keydown global. Tekan `s` saat reader terbuka → flag toggle 2x = net nol + 2 request; `r`/`f` buka compose 2x. Fix: `isReaderOwnedShortcut(selectedMsgId, key)` di constants.js — MailPage skip s/r/f saat reader terbuka. Bonus: MessageReader skip saat fokus di `contentEditable` (RichEditor compose) agar `r`/`s`/Delete tidak memicu aksi saat mengetik. `test:keyboard-ownership`.
3. **ContactsPage mobile**: panel detail `hidden md:block` → tap kontak di HP tidak menampilkan apa-apa. Fix: detail sheet mobile (overlay + backdrop, max-w-sm).
4. **Info-disclosure (minor)**: `warmUpSogoSession` log `sogoToken` (session token) ke console produksi via `console.warn`. Fix: `debugLog`/`debugWarn` DEV-only.
5. **Drag kalender menghilangkan data**: `handleDrop` set `attendees:''` + tidak kirim `repeat` → peserta & recurrence hilang diam-diam saat event dipindah. Fix: `src/lib/calendarDrop.js` `buildDroppedEventData` pertahankan attendees/repeat/classification. `test:calendar-drop`.
6. **Toast tertutup BottomNav mobile**: `fixed bottom-4` di HP tertutup nav. Fix: `bottom-20 left-3 right-3 md:bottom-4 md:right-4`.

### Validasi
- Baseline 40/40 → **43/43 test PASS** (3 test baru) · `npm run build` OK
- Tidak ada perubahan kontrak API/server; semua fix client-side + 1 log-level.

### Commit
- (lihat git log — batch ini satu commit)

## 2026-08-25T15:49:02Z
- Status: COMPLETED
- Objective: No objective recorded.
- Summary: Bug hunt menyeluruh flow/UI-UX/PC+mobile/fitur/security: 6 bug fixed (formatAddresses crash, keyboard double-fire s/r/f, detail kontak mobile, token leak di log warm-up, drag kalender hilangkan attendees/repeat, toast tertutup bottom nav). 43/43 test PASS, build OK.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M docs/ai/knowledge.md
-  M package.json
-  M src/components/Toast.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/lib/api.js
-  M src/lib/constants.js
-  M src/lib/format.js
-  M src/pages/CalendarPage.jsx
-  M src/pages/ContactsPage.jsx
-  M src/pages/MailPage.jsx
- ?? scripts/test-calendar-drop.mjs
- ?? scripts/test-format.mjs
- ?? scripts/test-keyboard-ownership.mjs
- ?? src/lib/calendarDrop.js

## [2026-08-26] Audit aksesibilitas (kontras, 44px, aria) — SELESAI & LIVE

Perbaikan aksesibilitas WCAG 2.1 AA: token kontras (muted-foreground 45%,
destructive light 0 72% 46% / dark 0 84% 58%), amber-900 session countdown,
star amber-600/400, spam orange-600/500, SwipeableRow dark:bg-red-700.
Touch target 44px (min-w-11/min-h-11) di toolbar MailPage, bulk toolbar,
MessageReader, Sidebar, flag picker, snooze presets. Aria-label semua tombol
icon-only + aria-pressed/expanded pada toggle; sender baris pesan jadi
<button>; focus-visible global di index.css. Test baru test:a11y (63
assertions). 44/44 PASS. Known limitations terdokumentasi: border token
1.23:1 (perlu keputusan desain utk 3:1), FLAG_COLORS yellow/green <3:1 light.

## 2026-08-26T01:07:44Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/components/SwipeableRow.jsx
-  M src/components/layout/Sidebar.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/index.css
-  M src/pages/MailPage.jsx
- ?? scripts/test-a11y.mjs

## [2026-08-26] Bug hunt kombinasi (multi-akun + konflik antar UI) — SELESAI & LIVE

Pass 6+ kombinasi: 2 bug. (1) queryKey ['smtp-session-status'] di Sidebar
tanpa scope user → cache React Query global menampilkan countdown sesi akun
sebelumnya sejenak saat ganti akun; fix scope per sogoToken. (2) MessageReader
terus ter-mount di belakang ComposeModal (flow reply) dan handler keyboard
tidak tahu compose terbuka → 'r' reset compose, 'Delete' hapus pesan yang
dibalas, Escape tutup reader; fix prop shortcutsEnabled={!composeOpen} +
guard di handler + deps. Verifikasi aman: localStorage semua *_v2_<email>
scoped, LoginPage revoke+clear sebelum login, server send terikat session.user
+ anti-spoof, visibleOrderUids sudah filter snooze, semua timer unmount-clean.
Test baru test:state-combination (7 assertions). 45/45 PASS.

## 2026-08-26T01:15:42Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/components/layout/Sidebar.jsx
-  M src/components/mailer/MessageReader.jsx
-  M src/pages/MailPage.jsx
- ?? scripts/test-state-combination.mjs

## [2026-08-26] Bug hunt edge case (event kalender) — SELESAI & LIVE

Pass 6+ edge case: EventModal tidak validasi end >= start → event durasi
negatif dikirim ke SOGo (rusak/500). Fix helper murni src/lib/eventValidation.js
(validateEventTimes + normalizeRepeatCount) + guard di handleSave; all-day
start==end tetap valid. repeat interval/count 0/negatif/NaN di-clamp ke 1.
Diverifikasi aman: pagination MailPage (dedup+sort+cufoff via uid min+stop
loop), StatsPage (semua default 0, Math.max guard), ContactsPage key uid||idx,
RulesPage StatsBar total==0, ComposeModal guard Kepada + validasi server.
Test baru test:event-validation (16 assertions). 46/46 PASS.

## 2026-08-26T01:35:07Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/components/EventModal.jsx
- ?? scripts/test-event-validation.mjs
- ?? src/lib/eventValidation.js

## [2026-08-26] Validasi format email di ComposeModal — SELESAI & LIVE

ComposeModal sebelumnya hanya guard "Kepada wajib diisi" — format invalid lolos
sampai server (400 generik). Tambah firstInvalidRecipient() di
src/lib/emailValidation.js (entri rusak pertama dlm daftar koma, reuse
isSafeRecipient anti-CRLF) + guard handleSend per field Kepada/Cc/Bcc dgn pesan
jelas: "Alamat email tidak valid di \"Kepada\": \"abc\". Gunakan format
nama@domain.com." Koma trailing diterima; server tetap validasi ulang
(validateRecipientList). Test:email-validation diperluas 10 kasus unit + 3
assertion statis ComposeModal. 46/46 PASS.

## 2026-08-26T01:39:42Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M scripts/test-email-validation.mjs
-  M src/components/mailer/ComposeModal.jsx
-  M src/lib/emailValidation.js

## [2026-08-26] Konflik duplikat event kalender — SELESAI & LIVE

2 jalur duplikasi event: (1) double-submit create — handleSave/handleDelete
tanpa re-entry guard; tombol disabled={saving} hanya efektif setelah re-render,
Enter auto-repeat/klik ganda di tick sama → 2x newEventGuid = 2 event. Fix
savingRef (useRef sinkron) di handleSave + handleDelete, reset di finally.
(2) Parsing eventsblocks tanpa dedup — baris duplikat id+start+calendar sama
dirender 2x. Fix: parser murni src/lib/calendarEvents.js (parseCalendarEvents)
dipakai api.js, dedup by id|start|calendar — recurring (start beda) & 
cross-calendar (kalender beda) TETAP dipertahankan; number vs string start
dinormalisasi; baris rusak di-skip. Test test:calendar-events 18 assertions.
47/47 PASS.

## 2026-08-26T01:43:52Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/components/EventModal.jsx
-  M src/lib/api.js
- ?? scripts/test-calendar-events.mjs
- ?? src/lib/calendarEvents.js

## [2026-08-26] Security & data refresh (OWASP) — SELESAI & LIVE

2 temuan: (1) /api/send rate-limit per-IP = self-DoS kantor/NAT (10 kirim/mnt
tersedot semua user 1 IP publik). Fix resolveSmtpSession middleware + key
bucket per session.user (fallback IP utk tanpa sesi); handler reuse
req.smtpSession, telemetry [smtp-session] 401 send dipertahankan
(monitor-smtp.sh grep). (2) searchMessages tanpa cap panjang → body raksasa
ke SOGo; fix MAX_SEARCH_QUERY_LENGTH=500 di buildMessageSearchBody +
maxLength=300 input MailPage. Verified kuat: semua route rate-limited
per-route, clientIp trusted-proxy-only, preferences/send user-binding 403,
pathSegment anti-traversal, attachment filename anti-path/CRLF, toSafeUrl
allowlist, headers CSP/XFO DENY, image-proxy sandbox+SSRF, API key
timing-safe, cookie httpOnly SameSite=Strict. Test test:security-hardening
16 assertions. 48/48 PASS. Deploy sync backend (restart proxy).

## 2026-08-26T01:49:00Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M server.js
-  M src/lib/messageRequests.js
-  M src/pages/MailPage.jsx
- ?? scripts/test-security-hardening.mjs

## [2026-08-26] Edge case kontak & sync signature — SELESAI & LIVE

3 fix: (1) highlight seleksi kontak match semua baris uid kosong — fix
isSelectedRow (uid bila ada, identitas objek bila kosong). (2) tambah kontak
duplikat personal dibuat diam-diam — fix findDuplicateKind() di
src/lib/contactUtils.js: duplikat personal diblokir dgn pesan, duplikat GAL
diizinkan (direktori read-only, salinan personal dari kolega = normal),
prioritas personal > gal. (3) sync signature SOGo one-way — perangkat lain
tak pernah menarik; fix shouldImportSogoSignature() di signatures.js
(idempotent by html trim) + PreferencesPage tarik sbg entri 'Signature SOGo'
saat belum ada di lokal; tidak menimpa editan, tidak menumpuk. Test
test:contact-signature-edge 18 assertions. 49/49 PASS.

## 2026-08-26T01:57:43Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M package.json
-  M src/lib/signatures.js
-  M src/pages/ContactsPage.jsx
-  M src/pages/PreferencesPage.jsx
- ?? scripts/test-contact-signature-edge.mjs
- ?? src/lib/contactUtils.js

## [2026-08-26] Audit keamanan nginx webmail (CSP/HSTS) — SELESAI & LIVE

configs/site.webmail.custom gap: HSTS, COOP, CORP, X-XSS-Protection,
upgrade-insecure-requests tidak ada di produksi. Ditambahkan ke 3 blok
location (/webmail, *.html, assets). HSTS tanpa includeSubDomains (subdomain
lain belum tentu HTTPS). img-src tetap 'self' data: TANPA https: — semua
gambar eksternal email lewat /api/image-proxy (anti tracking-pixel);
mengizinkan https: langsung membuka jalur pixel. nginx -t OK → reload →
headers live terverifikasi (curl). Non-regresi: image-proxy routing OK
(400 passthrough utk url invalid; 502 = status sengaja remoteImage.js utk
fetch gagal — DNS/redirect/UA). Webmail 200, health via key 200.

## 2026-08-26T02:01:52Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M configs/site.webmail.custom
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md

## [2026-08-26] /api/health konsistensi key + verify deploy — SELESAI & LIVE

/api/health butuh API key (server.js requireApiKey, bukan nginx — passthrough;
live 403/200). preflight deploy.sh sudah cek dgn key (backend langsung), tapi
verify() tidak cek health sama sekali — gap routing nginx pasca-deploy. Tambah
verify_health() di verify(): end-to-end via nginx (--resolve 127.0.0.1) + key
dari .env (pola awk heredoc spt preflight), harap 200. Keputusan: health tetap
di belakang key (konsisten /api/*; hanya {ok:true}, tidak sensitif). Catatan:
VITE_API_KEY di bundle = soft gate; auth sebenarnya cookie SMTP httpOnly.
Test security-hardening 21 assertions + bash -n OK. 49/49 PASS.

## 2026-08-26T02:04:33Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
-  M deploy.sh
-  M docs/ai/current-task.md
-  M docs/ai/handoff.md
-  M scripts/test-security-hardening.mjs

## 2026-08-26T02:06:03Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — ai-loop flow logic: snooze vs auto-archive (FIXED)

- **Bug 1 — Snooze tidak folder-scoped:** schema v2 flat `{uid: wakeEpoch}`
  membuat entri YATIM saat pesan di-archive (UID per-folder SOGo → UID baru di
  folder tujuan). UID lama yang dipakai ulang pesan inbox baru → pesan baru
  tersembunyi salah. **Fix:** schema v3 `{[folderId]: {[uid]: wakeEpoch}}` di
  `src/lib/snooze.js`, migrasi sekali-jalan via `readStorage(BASE_KEY, email, 3)`
  (versi per-domain — STORAGE_VERSION global TIDAK diubah agar key domain lain
  tidak ikut migrasi). Semua fungsi terima folderId.
- **Bug 2 — Auto-archive memindah pesan tersnooze:** `executeRules` kini terima
  `isExcluded(msg)` (MailPage kirim `(m) => snoozedUids.has(String(m.uid))`).
  Pesan yang di-snooze TIDAK dipindah rule — keinginan user "tunda" dihormati.
- **Bug 3 — Entri yatim tidak dibersihkan:** helper baru `unsnoozeMessages`
  dipanggil di onSuccess moveMutation/quickMoveMutation/junkMutation/
  archiveMutation (MailPage) + delete/move (MessageReader); bump `snoozeTick`
  (`clearSnoozesForMoved` / `onSnoozeCleared`) agar memo `snoozedUids`
  ter-refresh langsung (tanpa nunggu interval 60s).
- **Pelajaran:** snooze = deferral eksplisit → RULES HARUS SKIP pesan snooze
  (rules di-proses ulang saat wake via rulesProcessed reset per folder). UID
  SOGo per-folder → storage client yang keyed by uid WAJIB folder-scoped.
- Test: `test:snooze` + `test:autoarchive` diperluas (folder-scope,
  unsnoozeMessages, isExcluded) → **49/49 PASS** + build OK.

## 2026-08-26T02:16:57Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — ai-loop sorting: sortAsc vs conversation vs date-group (FIXED)

- **Bug 1 — Sort by UID bukan tanggal:** `sortedMessages` by uid membuat
  urutan tampil menyimpang dari tanggal (uid SOGo per-folder tidak dijamin
  sekuensial) + saat sortAsc urutan baris terbalik → date-group header terbalik
  (Lebih Lama di atas) + sticky header salah. **Fix:** helper murni
  `sortMessagesByDate` (date-desc, tiebreak uid, unparseable bawah) — sortedMessages
  selalu date-desc; `sortAsc` hanya membalik urutan GRUP via
  `reorderDateGroups` (flat) / `groupMessages(messages, asc)` (conversation).
- **Bug 2 — Conversation view abaikan sortAsc:** `groupMessages` kini terima
  `asc` — thread tertua di atas saat asc, pesan dalam thread tetap terbaru-dulu
  (pola Gmail).
- **Bug 3 — visibleOrderUids kosong:** saat conversation view aktif tapi semua
  subjek unik (grup kosong) fallback ke sortedMessages → range-select /
  auto-advance tidak mati.
- **Bug 4 — Keyboard focus beda urutan dari render:** j/k/o/scroll/clamp kini
  pakai `sortedMessages` (urutan tampil) bukan `messages` (uid-sort).
- **Pelajaran:** urutan RENDER, urutan KEYBOARD, dan urutan RANGE-SELECT harus
  dari SATU sumber (display order). Sort toggle = urutan grup, bukan urutan
  baris (baris selalu date-desc dalam grup).
- Test: `test:date-groups` diperluas (sortMessagesByDate, reorderDateGroups) →
  **49/49 PASS** + build OK.

## 2026-08-26T02:23:56Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — ai-loop multi-tab: snooze sync + auto-archive claim (FIXED)

- **Bug 1 — Snooze tidak sinkron antar-tab:** event `storage` hanya ter-fire di
  tab LAIN. Tambah listener di MailPage utk key `pcp_snooze_v3_<email>` /
  `pcp_snooze_v2_<email>` / `clear()` → bump `snoozeTick` → daftar langsung
  refetch (tab B lihat snooze/unsnooze tab A tanpa nunggu interval 60s).
- **Bug 2 — Auto-archive double-move antar-tab:** dua tab akun sama menjalankan
  rule engine independen (query cache + rulesProcessed per-tab) → bisa
  memindahkan pesan SAMA bersamaan. **Fix:** `claimAutoArchiveUids` di
  autoArchive.js — klaim uid di sessionStorage (per-tab, TTL 5 mnt); tab kedua
  SKIP uid yang sudah diklaim. `releaseAutoArchiveClaims` setelah move
  selesai/gagal. `rulesProcessed` hanya utk pesan yang BENAR-BENAR dipindah.
- **Notifikasi:** sudah aman — `tag: 'sogo-new-mail'` membuat browser mengganti
  notifikasi antar tab (tidak menumpuk).
- **Pelajaran:** koordinasi lintas tab = `sessionStorage` (per-tab, auto-clean)
  utk klaim/lock + event `storage` (antar-tab) utk sinkronisasi UI. Klaim TTL
  wajib agar kegagalan tidak mengunci selamanya.
- Test: `test:multitab` baru (claim, skip, release, TTL, scoped email) →
  **50/50 PASS** + build OK.

## 2026-08-26T02:29:57Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — ai-loop multi-tab: cache React Query Calendar/Contacts (FIXED)

- **Bug — Cache React Query per-tab, staleTime 5 mnt:** tab A create/delete
  event/kontak → invalidate hanya di tab A; tab B tampil data basi sampai
  stale. **Fix:** helper `src/lib/crossTab.js` (domain version bump) —
  `bumpDomainVersion(domain, email)` menulis timestamp MONOTONIK ke
  `pcp_<domain>_v_<email>`; `watchDomainVersion` pasang listener `storage`
  (fire di tab lain) → invalidate query saat versi naik. Dipasang di
  CalendarPage (create/update/delete + drag via handleUpdateEvent) dan
  ContactsPage (create/delete).
- **Bug yang ditemukan test:** bump pertama pakai `Date.now()` — dua bump
  dalam milidetik sama menghasilkan versi SAMA → tab lain tidak mendeteksi.
  Fix: `Math.max(Date.now(), prev + 1)` (monotonik).
- **Pelajaran:** pola sinkronisasi lintas-tab utk data server-side (React
  Query): penulis bump versi (localStorage) → tab lain invalidate via storage
  event. Versi WAJIB monotonik (bukan murni timestamp). TTL dibersihkan saat
  bump (ringan).
- Test: `test:cross-tab` baru (monotonik, scoped, clear, cleanup) →
  **51/51 PASS** + build OK.

## 2026-08-26T02:41:56Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — ai-loop performance & mobile: flagColors cache + swipe click (FIXED)

- **Bug 1 (performa) — getFlagColor baca localStorage per-baris:** getStore()
  membaca+parse+normalisasi seluruh store flag utk SETIAP pemanggilan
  getFlagColor — dipanggil beberapa kali per baris × 50+ baris di MailPage.
  **Fix:** cache in-memory `storeCache` (per email) di flagColors.js,
  invalidate saat tulis via API. `__resetFlagColorCache()` utk test/storage
  eksternal. Diverifikasi: getFlagColor beruntun utk key ter-cache = 0 baca
  localStorage (spy getItem).
- **Bug 2 (mobile) — swipe membuka pesan sekaligus:** synthetic click browser
  setelah touchend tidak ditekan → swipe-to-delete juga membuka pesan.
  **Fix:** prop `onSwipe` di SwipeableRow (dipanggil sebelum aksi saat threshold
  terlampaui) → MailPage `suppressClick.current.add(uid)` → handleRowClick
  menelan click (pola sama dengan long-press).
- **Pelajaran:** hot path render (per-baris × per-render) WAJIB bebas baca
  storage sinkron — cache in-memory + invalidate-on-write. Gesture touch yang
  menghasilkan aksi (swipe/long-press) harus menekan synthetic click browser.
- Test: test-flag-colors (read-count) + test-a11y (+4 assertion swipe) →
  **51/51 PASS** + build OK.

## 2026-08-26T02:50:50Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## 2026-08-26 — Pengukuran dampak cache flagColors (benchmark A/B)

- **Metode:** `scripts/benchmark-flag-cache.mjs` (`npm run bench:flag-cache`)
  memakai modul asli flagColors.js, pola hot path MailPage (N baris × k lookup
  per baris × banyak siklus), store realistis (10% berflag). Sebelum = reset
  cache tiap pemanggilan (perilaku pra-fix); Sesudah = cache aktif.
- **Hasil (konsisten 3 run):** 50 baris ×2×120 → 8.5ms→3.2ms (62–78%),
  100×3×60 → 2.3→0.9ms (58–68%), 200×2×60 → 9.0→1.4ms (58–84%).
  **98–99% baca localStorage berkurang** (120→1, 60→1). Di browser biaya
  baca sinkron lebih besar (IPC + GC), jadi gap nyata lebih lebar.
- **Keterbatasan:** benchmark CPU-side Node — perbandingan jank scroll
  end-to-end di browser butuh sesi login asli (TODO user: buka inbox besar di
  produksi, scroll, bandingkan sebelum/sesudah secara manual).
- Benchmark ter-register sebagai `bench:flag-cache` (bukan test suite).

## 2026-08-26T02:58:08Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## [2026-08-26] Cache getRules (hot path) — ai-loop performa round 2
- **Task:** terapkan pola cache flagColors ke rules engine auto-archive.
- `getRuleSummary` dipanggil per-render MailPage, `getRules` di render RulesPage, dan
  `matchRules` per-message di executeRules — semua sebelumnya baca + parse + normalisasi
  SELURUH rules dari localStorage per pemanggilan.
- **Fix:** cache in-memory `rulesCache` (Map email → array) di autoArchive.js, invalidate
  di saveRules + clearAllRules (semua CRUD lewat jalur ini; executeRules bump runCount
  lewat updateRule → ikut invalidate). `__resetRulesCache()` utk test/storage eksternal.
- **Test:** assertion read-count spy di test-autoarchive (1-2 baca pertama, 0 baca untuk
  20 panggilan beruntun + matchRules/getRuleSummary, ≤2 baca setelah invalidate).
  50/50 PASS + bash script + build OK.
- **TODO manual (dari round benchmark):** verifikasi jank scroll browser end-to-end di
  inbox besar (butuh sesi login asli) — belum diverifikasi live karena sandbox.

## 2026-08-26T03:04:31Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## [2026-08-26] ai-loop compose & draft flow — race autosave + edit draft
- **Task:** rotasi ai-loop fokus compose/draft. 3 bug + 1 latent diperbaiki.
- **Autosave race:** handleSend tidak clearTimeout → draft yatim saat kirim; tidak ada
  in-flight guard → konten stale bisa menimpa. Fix: sentRef + autosaveBusy + reschedule
  di finally + clearTimeout di handleSend.
- **Edit draft (UX baru):** klik draft di folder Draf → buka ComposeModal (openDraftForEdit
  di MailPage, fetch detail + extractHtml). Autosave ke draft baru, draft asli dihapus saat
  kirim. Signature tidak disuntik ulang. Autosave digate userEditedRef (buka tanpa edit ≠
  buat salinan).
- **Bug latent extractHtml:** prefer text/html di kedalaman mana pun (dulu plain bisa menang
  bila html bersarang lebih dalam dari part plain pertama). Dipindah ke src/lib/messageHtml.js,
  dipakai MessageReader + MailPage.
- **KETERBATASAN KNOWN:** draft dengan lampiran tidak bisa direstorasi (saveDraft tidak
  menyimpan lampiran; payload SOGo save hanya teks). Saat edit draft ber-lampiran, user
  harus lampirkan ulang. Bisa jadi task berikutnya (perlu upload lampiran ke draft SOGo).
- Test: test:draft-compose baru (24 assertion statis) + test-message-html diperluas.
  52/52 PASS + build OK.

## 2026-08-26T03:14:25Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## [2026-08-26] Restorasi lampiran draft saat edit
- **Task:** hilangkan keterbatasan draft ber-lampiran tidak bisa direstorasi.
- **Flow:** `openDraftForEdit` (MailPage) → extractAttachments(detail.parts) →
  Promise.allSettled(fetchAttachmentData(downloadURL)) → base64 → initialData.attachments
  → ComposeModal seed attachments saat reset (id baru dari attachIdRef, tanpa memicu
  autosave). Kirim via /api/send membawa lampiran; draft asli + autosave dihapus.
- **Dedup:** extractAttachments dipindah ke src/lib/messageHtml.js (dipakai MessageReader
  + MailPage). fetchAttachmentData baru di api.js (downloadURL memuat token sesi, chunked
  base64 32KB).
- **Perilaku gagal:** satu lampiran gagal diunduh → dilewati + warning console; buka
  draft tetap berjalan. Bukan user edit → tidak memicu autosave.
- Test: test-message-html (+8), test-draft-api (+9), test-draft-compose (+8). 52/52 PASS.
- TODO manual: verifikasi di browser produksi dengan draft yang punya lampiran (buka →
  lampiran muncul → kirim → cek terkirim lengkap). Butuh akun yang punya draft ber-lampiran.

## 2026-08-26T03:21:10Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## [2026-08-26] ai-loop search flow — 4 bug interaksi pencarian
- **Bug 1:** window 5 bulan Kotak Masuk juga memotong hasil SEARCH → email lama tetap
  tak bisa dicari. Fix: skip window saat searchQuery (helper murni applyMessageWindow di
  dateGroups.js, unparseable tetap tampil).
- **Bug 2:** auto-archive rules berjalan saat mode search (messages = hasil cari) → pesan
  bisa dipindah diam-diam saat user mencari. Fix: early-return saat searchQuery + deps.
- **Bug 3:** pesan di-snooze tersembunyi JUGAdi hasil search → tak bisa ditemukan sampai
  wake. Fix: snooze filter di-skip saat searchQuery (pola Gmail).
- **Bug 4:** categoryFilter tidak di-reset saat search tapi tab kategori disembunyikan →
  hasil disaring tak terlihat. Fix: setCategoryFilter(null) di handleSearchSubmit +
  searchBySender.
- Test: test:search-flow baru (9 assertion statis) + test-date-groups (+7).
  53/53 PASS + build OK.

## 2026-08-26T03:26:21Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## [2026-08-26] Posisi ikon dynamic sizing (MailPage)
- **Fix 1:** input search pr-4 → pr-10 — tombol ✕ (36px) tidak lagi menimpa teks query.
- **Fix 2:** header list (judul + badge + 5 tombol ikon) min-w-0 flex-1 + label truncate +
  badge/cluster shrink-0 — tidak overflow saat panel list menyempit ke 240px.
- **Fix 3:** header baris pesan items-baseline → items-center — cluster ikon sejajar
  vertikal dgn baris pengirim.
- Test: test:a11y +6 assertion (73 total). 53/53 PASS + build OK.
- TODO manual: cek visual di browser (desktop + mobile) — lebar list 240px + nama folder
  panjang + query search panjang; konfirmasi tidak ada ikon terpotong/timpang.

## 2026-08-26T03:32:20Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Header Kalender & Kontak — konsistensi dynamic sizing
Menerapkan pola `min-w-0`/`truncate`/`shrink-0` yang sama seperti MailPage ke header Kalender & Kontak:
- CalendarPage: judul truncate (menyusut duluan), ViewSwitcher + cluster navigasi + judul periode shrink-0.
- ContactsPage: judul truncate + badge shrink-0, tombol Tambah + cluster filter shrink-0.
- test-a11y +7 assertion statis (80 total).

## Kalender recurring & timezone (3 bug) — 54/54 PASS, live
- **UTC vs lokal**: SEMUA tanggal kalender wajib helper `src/lib/dateFormat.js`
  (`toLocalDateStr`/`toLocalTimeStr`), JANGAN `toISOString()` (UTC). WIB +7:
  00:00–06:59 lokal = tanggal UTC kemarin → klik sel / edit 02:00 / drag dini
  hari pindah sehari. EventModal + calendarDrop sudah dipindah.
- **Multi-day**: eventsOnDay overlap (`s <= dayEnd && e > dayStart`, end
  eksklusif) — event 2 hari muncul di semua hari yang di-span; all-day tetap 1 hari.
- **Drag recurring**: grid eventsblocks tidak punya repeat (hanya c_iscycle) →
  handleDrop fetch /view saat isRecurring utk gabung repeat sebelum save.
  Keterbatasan tercatat: drag/edit occurrence tunggal = edit seluruh seri
  (SOGo pakai id sama; butuh recurrence-id exception utk edit 1 kejadian).

## 2026-08-26T07:29:38Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Hardening error production — timeout + chunk reload + pesan ramah
3 fix defensif untuk "sebagian user kena ErrorBoundary di /webmail/mail" dan
"gagal fetch saat login":
- **fetchWithTimeout**: connectSogo 20s, registerSmtpSession 15s (AbortError → pesan jaringan).
- **friendlyLoginError**: "Failed to fetch"/"NetworkError"/AbortError/TCP reset → pesan Indonesia.
- **lazyWithReload**: chunk 404 pasca deploy → reload sekali (sessionStorage flag) → hindari ErrorBoundary.

## 2026-08-26T08:12:44Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Rotasi kontak (GAL/personal) — 2 bug, 54/54 PASS, live
- **parseContactRow** (contactUtils.js): SOGo kadang balik c_cn/c_mail/emails
  sebagai OBJECT → filter search `.toLowerCase()` / render React crash. Semua
  field dinormalisasi string + emails array-of-string/object + baris rusak → null.
- **savingRef** di ContactsPage: anti double-submit create (Enter auto-repeat /
  klik ganda = kontak duplikat).

## 2026-08-26T08:27:10Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Ai-loop menyeluruh (security+robustness+flow) — 2 bug, 54/54 PASS, live
- Security & robustness audit: BERSIH (XSS/tabnabbing/input validation sudah solid dari round sebelumnya).
- Fix 1: klik "+" sel bulan kalender / tombol Event mengirim tanggal midnight →
  EventModal terisi 00:00-01:00. openCreateModal sekarang default jam 09:00
  (hour=null); week/day view kirim hour asli.
- Fix 2: tutup ComposeModal mode edit-draft tanpa kirim → copy autosave tertinggal
  = duplikat di Draf. handleClose hapus copy (hanya saat editing draft).

## 2026-08-26T08:43:38Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Rotasi bulk/undo-delete — 1 bug data-kritis, 55/55 PASS, live
- Timer undo-delete 6s fire setelah user pindah folder → moveMutation dulu
  memakai selectedFolder saat ini → UID sama di folder baru (pesan BEDA) ikut
  terhapus. Fix: sourceFolder dikunci saat scheduleDelete; moveMutation pakai
  vars.sourceFolder; snooze/invalidate pakai folder asal; seleksi dibersihkan
  saat menjadwalkan (bukan saat move sukses).

## 2026-08-26T09:02:25Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## MessageReader fitur hilang di-restore (regresi 6c1485f) — 55/55 PASS, live
- Commit 6c1485f (fix nginx) menimpa MessageReader.jsx dgn versi lama → 5 fitur
  hilang: lightbox preview gambar/PDF, tambah-ke-kontak, markMessagesAsJunk
  native, unduh-semua lampiran, viewURL. Semua di-restore + test regresi.
- Lightbox: Esc tutup lightbox dulu baru reader (lightbox di dep array handler).

## 2026-08-26T09:09:50Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Conversation view Outlook-like + anti-overlap (2026-08-26)

**Tujuan user:** 1) pastikan tidak ada item bertumpuk, 2) mode conversation semirip Outlook.

**Yang dikerjakan:**
- Logika conversation dipindah ke lib murni `src/lib/conversations.js` (normalizeSubject, senderDisplayName, messageParticipants, groupConversations) → testable.
- **Fix overlap:** baris di dalam percakapan tidak lagi memakai `border-l-4` (sebelumnya bertumpuk dengan thread line `border-l-2`); aktif = bg highlight. Pemisah grup via divide-y parent, border-b dihapus.
- **Outlook-like:** header grup = avatar stack (maks 3), subjek tebal bila unread + dot, peserta (truncate, +N bila >2), waktu terbaru, count badge, chevron, aria-expanded/aria-label.
- **Clustering partisipan:** `groupConversations(messages, asc, selfEmail)` — thread A↔B menyatu walau from bergantian; "Invoice" dari dua vendor berbeda terpisah (selfEmail dikecualikan dari peserta supaya alamat akun sendiri tidak jadi titik temu palsu).
- Test: `scripts/test-conversations.mjs` (30 assertion) + test-a11y +8 → **55/55 PASS**, build OK.

**Catatan:** urutan pesan dalam grup = urutan input (caller sudah date-desc) → `latest = messages[0]`. Jangan beri makan groupConversations dengan array tak tersortir.

**Belum:** commit + push + deploy. Push pakai tunnel SOCKS5 bila gitlab unreachable (`ssh -f -N -D 1080 deploy-mail` lalu `git -c http.proxy=socks5h://127.0.0.1:1080 push origin main`).

## 2026-08-26T09:25:31Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Auto-advance reader dipulihkan (lanjutan ai-loop, 2026-08-26)

**Temuan:** audit rotasi conversation menemukan regresi dari merge `08bef9c`: MessageReader tidak lagi mengonsumsi `siblingUids`/`onNavigateTo` (prop masih di-pass MailPage tapi yatim) → setelah hapus/pindah/spam, reader selalu `onClose()` (kembali ke daftar) padahal versi lama (`558d3e7`) membuka pesan berikutnya (pola Gmail/Outlook).

**Fix (`navigateAfter`):** dibaca ulang dari versi lama — setelah delete/move/spam, cari `siblingUids[idx+1] ?? siblingUids[idx-1]`; ada → `onNavigateTo(next)`, tidak ada → `onClose()`. Dipakai 3 mutation (delete, move, spam) agar konsisten.

**Test:** `test-a11y` +5 assertion (prop siblingUids/onNavigateTo ada, navigateAfter ada, fallback ada, dipakai setelah aksi, MailPage pass prop) → **101 assertions** · **55/55 PASS** · build OK.

**Belum:** commit + push + deploy.

## 2026-08-26T09:40:03Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Ai-loop: tracking-pixel proxy ter-wire + labelField Terkirim/Draf (2026-08-26)

**Temuan penting:** `proxyExternalImages` (lib imageProxy.js) sudah lengkap + test (test-tracking-pixel 68 assertion) tapi TIDAK dipanggil dari komponen mana pun → gambar eksternal di body email bocor langsung ke domain pengirim (IP user + read-receipt). Ini bug silent — lib + test hijau tapi fitur mati. Pelajaran: fitur lib harus punya assertion STATIS yang memverifikasi wiring di komponen (bukan hanya unit test lib).

**Fix:**
- MessageReader: `renderHtml = proxyExternalImages(cleanHtml)` dipakai di body render + print. Quote balasan/forward pakai `cleanHtml` (URL asli — harus valid utk penerima).
- `groupConversations` + opsi `labelField` — Terkirim/Draf pakai `to`, lainnya `from` (header percakapan konsisten dgn label baris).
- `isSentOrDraft` dinaikkan ke atas MailPage (TDZ: dipakai memo conversationGroups sebelum deklarasi lama).

**Verifikasi:**
- SOGo kirim `X-Frame-Options: SAMEORIGIN` utk viewPart → lightbox PDF iframe aman.
- `resolveCidImages`: regex global `.test()` lalu `.replace()` aman (replace reset lastIndex).

**Test:** test-conversations +2, test-a11y +6 → **107 assertions** · **55/55 PASS** · build OK.
**Belum:** commit + push + deploy.

## 2026-08-26T09:57:58Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Ai-loop: ComposeModal/send flow (2026-08-26)

**Bug 1 (race):** autosave in-flight saat tutup mode edit-draft → copy yatim di Draf. handleClose hanya hapus copy yang SUDAH ada; saveDraft yang selesai setelah tutup membuat copy baru. Fix: guard `closedRef` (set di handleClose, cek di runAutosave pasca-save, reset saat buka). Compose baru tetap pertahankan draft (fitur lanjutkan dari Draf).

**Bug 2:** reply/forward tidak kirim `composeMode: 'reply'` → ComposeModal memakai signature 'new' utk balasan. Fix: kedua handler onReply kirim `composeMode: 'reply'`.

**Aman:** attachment validation (10/4MB), send chokepoint sanitize ganda, draft cleanup pasca-kirim, RichEditor sanitize input/paste/tab, modal tanpa backdrop-close (sengaja).

**Test:** test-draft-compose +8 → 44 assertions · **55/55 PASS** · build OK.
**Belum:** commit + push + deploy.

## 2026-08-26T10:04:26Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Audit anti-overlap elemen/ikon (2026-08-26)

**Bug 1 (kalender):** event overlap di slot jam sama (week/day view) full-width → saling menimpa. Fix: `layoutOverlappingEvents` (lib calendarEvents.js, greedy columns) + dipakai di week & day view via `slotLayouts`; style left/width pakai calc(%).

**Bug 2 (compose):** baris "Kepada" overflow di modal mobile (label+input+Cc/Bcc > 280px inner). Fix: flex-wrap.

**Bug 3 (compose):** footer Kirim terpotong. Fix: footer wrap + cluster kiri flex-1 min-w-0 + Kirim shrink-0.

**Aman (audit pass):** bulk toolbar, reader toolbar, password inputs pr-10/20, RulesPage/StatsPage, flag/snooze clamp, avatar stack z-order, month grid slice+3.

**Test:** test-calendar-events +13, test-a11y +5, test-draft-compose +4 → **55/55 PASS** · build OK.
**Belum:** commit + push + deploy.

## 2026-08-26T10:11:11Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Audit overlap putaran 2 (2026-08-26) — halaman tersisa

**Bug:** badge user info StatsPage — email panjang tanpa truncate mendorong error badge (ml-auto) terpotong di layar sempit. Fix: container min-w-0 + span truncate min-w-0 + error ml-auto shrink-0.

**Audit pass (tidak diubah):** conversation header, reader toolbar, sidebar collapsed, calendar header, contacts, QuickRule/EventModal, RichEditor toolbar, suggestion list, login, email-body CSS (table/pre/overflow), drag-resize clamp, popover clamp.

**Test:** test-a11y +2 → 114 assertions · **55/55 PASS** · build OK.
**Belum:** commit + push + deploy.

## 2026-08-26T10:18:07Z
- Status: COMPLETED
- Objective: No objective recorded.
- Branch: main
- Changed Files:
- No local changes detected

## Audit overlap putaran 3 — width-budget baris pesan (2026-08-26)

**Bug:** cluster aksi baris pesan (filter/snooze/archive/star) memakai `opacity-0 pointer-events-none` saat idle → TETAP reserve ruang. Di list 240px: konten 176px − 104px tombol invisible ≈ pengirim 13px.

**Fix (Gmail-like):** aksi `hidden group-hover:flex`, date `group-hover:hidden` (aksi menggantikan posisi tanggal saat hover); star selalu tampil bila berflag/touch, hidden-until-hover di desktop saat tidak berflag. Checkbox avatar tetap overlay absolute (tidak reserve). Folder sidebar row tetap opacity-0 (sengaja, tanpa shift hover).

**Test:** test-a11y +3 → 117 assertions · **55/55 PASS** · build OK.
**Belum:** commit + push + deploy.
