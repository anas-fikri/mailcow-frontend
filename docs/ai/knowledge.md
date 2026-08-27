# Project Knowledge Log

Record durable findings discovered during completed tasks. Include codebase,
architecture, infrastructure, CI/CD, deployment, operations, constraints,
bugs, and validation knowledge. Do not record secrets or transient debug logs.

## Entries

## 2026-08-18 — React #310 ROOT CAUSE: useRef after early return

- **Root cause sebenarnya:** 3x `React.useRef` (contactNameRef, contactEmailRef, contactPhoneRef) dideklarasikan SETELAH early return `if (!msgId) return null;`. React melihat jumlah hook berbeda antara render → Rules of Hooks violation → React #310.
- **Cara detect:** stack trace menunjukkan `useRef` di posisi yang tidak biasa; cek SEMUA hook declarations apakah ada yang SETELAH conditional return.
- **Pelajaran KRITIS:** SEMUA hooks WAJIB di urutan yang SAMA di setiap render. Tidak boleh ada hooks di dalam: (1) conditional (if/ternary), (2) setelah early return, (3) di dalam loop, (4) di dalam callback. Kalau butuh refs utk conditional UI, tetap declare di TOP of component.

## 2026-08-18 — React #310 root cause: invalidateQueries inside queryFn

- **Root cause sebenarnya:** `queryClient.invalidateQueries` dipanggil di DALAM `queryFn` (via markRead). Ini trigger refetch query lain → re-render parent → component re-render → query run lagi → `invalidateQueries` lagi → infinite loop.
- **Fix:** Pindah `markRead` + `invalidateQueries` dari `queryFn` ke `useEffect` terpisah. QueryFn harus SUCI — tidak boleh ada side effect yang modify query cache.
- **Pelajaran penting:** JANGAN panggil `queryClient.invalidateQueries` di dalam `queryFn` — ini bisa cause cascading re-renders → React #310. Invalidatequeries hanya boleh dipanggil dari event handler atau useEffect.

## 2026-08-18 — React #310: focusIdx dep interaction (partial fix)

- **React error #310 = Maximum update depth exceeded:** focusIdx clamp effect punya `focusIdx` di dependency array → bisa berinteraksi dgn reset effect.
- **Fix:** Hapus `focusIdx` dari dependency array — hanya `messages.length` yang penting.
- **Pelajaran:** useEffect yang memanggil setState sebaiknya TIDAK memasukkan state yang di-set ke dependency array — bisa create loop.

## 2026-08-18 — fetchMessage retry + MessageReader error UI

- **SOGo transient 500:** SOGo偶尔return 500 saat overloaded (terutama banyak user login serentak). fetchMessage tanpa retry langsung throw → ErrorBoundary crash. Fix: retry 2x + delay 300ms/600ms.
- **ErrorBoundary vs internal error UI:** ErrorBoundary menangkap SEMUA error di tree → tampil scary page "Terjadi Kesalahan". Untuk error yang BUKAN crash (fetch gagal, data kosong), lebih baik handle internal di komponen → tampil error UI yang user-friendly + tombol retry.
- **React Query retry vs manual retry:** React Query punya retry bawaan (default 3x), tapi delay-nya terlalu pendek utk SOGo yang butuh waktu recover. Tambahan `retry: 2, retryDelay: 500` di useQuery memberikan waktu lebih.
- **Pelajaran:** komponen yang fetch data kritis (email body) harus punya 3 lapis defense: (1) fetch retry, (2) React Query retry, (3) internal error UI dengan tombol retry. Jangan biarkan error bubble ke ErrorBoundary untuk kasus transient.

## 2026-08-18 — Bug hunt loop: 7 bugs ditemukan + diperbaiki (5-pass systematic)

- **Side effect di useMemo:** `pruneExpired()` menulis localStorage di dalam `useMemo` → side effect saat render. Pattern ini bahaya: React bisa panggil useMemo berkali-kali (concurrent mode). Fix: pisah ke `useEffect` terpisah.
- **Pagination reset:** `visibleCount` tidak di-reset saat ganti folder → folder baru dengan pesan lebih sedikit langsung tampil semua. Fix: tambah `setVisibleCount(PAGE_SIZE)` di reset effect.
- **focusIdx out-of-bounds:** Saat messages berubah (ganti folder/search), `focusIdx` bisa tetap di index lama → `messages[focusIdx]` = undefined → crash di keyboard handler. Fix: `useEffect` clamp ke `messages.length - 1`.
- **Quick reply tanpa recipient:** `handleQuickSend` tidak validasi `recipient` → SOGo error kalau `replyTo` + `from` kosong. Fix: guard `if (!recipient) toast.error()`.
- **Toast raw folder ID:** RulesPage `handleRunNow` tampilkan `rule.actionFolder` (mis. `folderArchive`) saat folderById null. Fix: `.replace(/^folder/, '')`.
- **executeRules silent error:** `.catch` hanya console.warn → user tidak tahu aturan gagal. Fix: tambah `toast.warning`.
- **autoArchive body field:** SOGo list view TIDAK mengembalikan field `body` → kondisi berbasis body tidak pernah match. Fix: hapus `body` dari `RULE_FIELDS`.

## 2026-08-18 — Bugs audit: localStorage silent fail, TDZ fragile code, folder path inconsistency

- **localStorage silent fail pattern:** `saveRules(email, rules)` punya guard `if (!email) return;` → rule TIDAK disimpan tapi caller tidak tahu (addRule tetap return newRule, toast success). Pattern serupa bisa ada di fungsi localStorage lain. Fix: `addRule` throw Error jika email kosong, atau caller validasi sebelum panggil.
- **TDZ di React functional component:** `const` variabel dideklarasikan SETELAH fungsi yang menggunakannya — aman di runtime (closure capture by reference, dipanggil setelah render), tapi fragile: refactor pindah urutan bisa crash. Best practice: deklarasikan SEMUA helper/const SEBELUM fungsi yang menggunakannya.
- **Folder path conversion:** SOGo butuh path relatif (`Archive`), bukan id (`folderArchive`). moveMessages sudah handle `typeof string → decodeURIComponent(id.replace(/^folder/,''))`. Tapi konsistensi lebih baik: semua caller kirim objek folder `{path, id, label}`, string id cuma fallback.
- **Pelajaran:** audit cross-component bug: cek apakah data yang DISIMPAN (component A) formatnya SAMA dengan yang DIBACA (component B). Sumber truth: localStorage key harus identik (email format, casing).

## 2026-08-18 — Pola fitur harian batch 2: auto-advance, date groups, kontak dari email, kalender UX, rule apply-to-existing

- **Auto-advance reader:** MessageReader terima `siblingUids` (urutan uid yang TAMPIL, dari `visibleOrderUids` MailPage) + `onNavigateTo`; setelah delete/move sukses → buka `siblingUids[idx+1]`, fallback `idx-1`, else onClose. Pola Gmail; jangan onClose() mentah kalau daftar masih ada isi.
- **Group by tanggal (`src/lib/dateGroups.js`):** SOGo `RelativeDate` return display-string (ISO/RFC/'today'/'yesterday'/epoch) — jangan diandalkan formatnya; `parseMessageDate` toleran (epoch 8-11 digit, today/yesterday literal, Date.parse), unparseable → bucket 'older' (tidak crash). Bucket: 0=Hari Ini, 1=Kemarin, 2-6=Minggu Ini, 7-29=Bulan Lalu, >=30=Lebih Lama. Render header sticky tipis di flat list; keyboard focus butuh index kontigu (`flatIdx` manual), jangan pakai index asli msg di sortedMessages.
- **Tambah kontak dari email:** SOGo contact create = `POST /SOGo/so/{token}/Contacts/personal/new` body `{c_cn, c_mail, c_telephonenumber}` (BUKAN name/email). MessageReader prefill dari `msg.from[0]` ({name,email}) atau `msg.to[0]` utk Terkirim/Draf (`isSentOrDraftFolder`).
- **Kalender UX:** klik sel bulan = pilih saja; tombol "+" kecil per sel (hover / selalu utk selected+today) utk create. Week/day view: klik jam = create langsung (natural). Jangan buka modal create dari klik sel biasa — user sering cuma mau pilih tanggal.
- **Rule apply-to-existing:** `matchRules(email, msg)` di `src/lib/autoArchive.js` bisa dipakai ulang utk "Jalankan Sekarang": `fetchMessages('folderINBOX')` → filter uid yg match → `moveMessages` batch → `updateRule` runCount. Engine rules tidak perlu endpoint baru.
- **Pelajaran umum:** fitur "mudahkan harian" = reuse engine yang SUDAH ada (matchRules, moveMessages, visibleOrderUids, isSentOrDraftFolder) + komponen modal kecil; semua client-side/localStorage aman; server-side hanya yang SOGo dukung (move, contact create, fetch inbox).

## 2026-08-18 — SOGo v5 move: endpoint `moveMessages`, UIDs harus integer, folder = path absolut

- **SOGo 5.12 TIDAK punya endpoint `POST /Mail/0/{folder}/batchMoveToMailbox`** — 404 (verified: `grep -aoc` di binary `MailerUI` = 0 hit; `moveMessages` = 3 hit).
- **Yang benar (dari `Mailer/Mailbox.service.js` `$moveMessages`):** `POST /Mail/0/{folder}/moveMessages` body `{uids: [], folder: <path relatif>}` — mis. `folder: "Archive"` atau `folder: "INBOX/Sub"`. **BUKAN** id berprefix (`folderArchive`) dan bukan `{mailbox: ...}`.
- **Respon** berisi `unseenCount` (bisa dipakai update badge).
- **Pola id folder app:** `'folder' + path.replace(/\//g, '%2F')` (flattenMailboxes). Konversi id → path SOGo: `decodeURIComponent(id.replace(/^folder/, ''))` → `folderINBOX%2FSub` → `INBOX/Sub`. Karena itu caller sebaiknya kirim OBJEK folder (`{path, name, id}`) ke `moveMessages`, string id cuma fallback (auto-archive rules).
- **Endpoint SOGo lain yang valid (verified di binary):** `markMessageRead`, `markMessageUnread`, `markMessageFlagged`, `markMessageUnflagged`, `batchDelete`, `moveMessages`. Aksi per-message SOGo UI asli pakai GET (`$$resource.fetch`), tapi POST juga diterima oleh action routing SOGo.
- **Pelajaran (sama dgn search):** sebelum panggil endpoint SOGo dari app, verifikasi nama action di bundle JS asli (`WebServerResources/js/Mailer/*.service.js`) + binary `MailerUI` di container `mailcow-sogo-mailcow-1`. Endpoint "masuk akal" (`batchMoveToMailbox`) belum tentu ada.

## 2026-08-18 — SOGo v5 search: folder view + filters (endpoint /search TIDAK ada)

- **SOGo 5.12 TIDAK punya endpoint `POST /Mail/0/{folder}/search`** — 404 (verified di log nginx sejak 13 Agu, semua user). UI SOGo asli mencari via `Mailbox.$filter()` → `POST /Mail/0/{folder}/view` dengan body `{ sortingAttributes: {sort, asc, match?}, filters: [{searchBy, searchInput, negative, operator?}] }`.
- **searchBy SOGo valid:** `subject_or_from`, `subject_or_to`, `contains`, `body`, `from`, `to`, `subject`. Criteria UI `all` → `contains`; filter kosong (`!searchInput`) di-reject SOGo. `sortingAttributes.match='OR'` utk filter dua-field (subject_or_*).
- **Sumber kode SOGo:** container `mailcow-sogo-mailcow-1`, `/usr/local/lib/GNUstep/SOGo/WebServerResources/js/Mailer/Mailbox.service.js` (fungsi `$filter`) + `VirtualMailbox.service.js` (`startSearch` → `mailbox.$filter(attrs, params)`).
- **Pelajaran:** kalau endpoint json SOGo 404, baca kode UI SOGo asli (bundle js di container) sebelum menebak — UI asli adalah dokumentasi terbaik utk JSON API.
- **Cara lain yang valid:** `POST /Mail/0/{folder}/search` mungkin ada di SOGo <5 versi tertentu; app ini target 5.12 → pakai view+filters.

## 2026-08-18 — Snooze client-side + pola fitur harian (sogo-frontend)

- **Snooze TIDAK perlu folder/endpoint server:** simpan `{uid: wakeEpoch}` di localStorage per akun (`pcp_snooze_<email>`), sembunyikan pesan di daftar via filter client-side, prune tiap menit → muncul kembali otomatis. Email TETAP di folder asli — klien lain tetap melihatnya (trade-off diterima; aman).
- **`getUnseenCount(sogoToken, folder)`:** SOGo endpoint per-folder `/Mail/0/{folder}/view` mengembalikan `unseenCount` — cukup utk badge sidebar per folder (junk/sent/drafts). `Promise.allSettled` + reduce → map per folder, refetch 60s (paralel ringan, jangan per SEMUA folder user — banyak request).
- **Quick reply:** kirim via `sendMessage` yang sama (SOGo compose→save→send + fallback `/api/send` SMTP) — tidak ada endpoint khusus. Body textarea di-escape + `\n`→`<br>`; penerima `replyTo || from`.
- **Unduh semua lampiran:** SOGo `downloadURL` per lampiran (relative — perlu `toSafeUrl(url, {base: SOGO_BASE, allowExternal:false})`); buka tiap URL di tab baru `window.open` — session cookie ikut, tidak perlu token khusus.
- **Cari per pengirim:** search criteria `'from'` (SOGo search endpoint `criteria: 'from'`) — dari sender text, ekstrak email via regex `/[A-Za-z0-9._%+-]+@.../`, set searchQuery + criteria.

## 2026-08-18 — SOGo draft flow + folder Archive

- **SOGo draft API:** `GET /Mail/0/compose` → `{draftId}`; `POST /Mail/0/folderDrafts/{draftId}/save` (JSON, body `{subject,to:[],cc:[],bcc:[],replyTo,inReplyTo,references,text,isHTML,from}`) → `{uid}`; `POST .../batchDelete` `{uids:[uid]}` utk hapus draft. Draft yang sudah ada TIDAK di-overwrite oleh `sendMessage` (yang membuat compose draft baru) — autosave draft harus dihapus manual setelah kirim sukses biar tidak menumpuk.
- **Folder Archive:** Dovecot/Mailcow punya folder root `Archive` di SEMUA akun (diverifikasi `doveadm mailbox list`). Path case-sensitive `Archive`; regex cari `/archive$/i` aman. Tombol arsip tidak perlu membuat folder.
- **Notifikasi browser:** SOGo tidak punya push — polling `getUnseenCount` (refetchInterval 60s) + deteksi kenaikan = notifikasi email baru. `Notification` permission diminta sekali saat login pertama; `document.title` badge selalu diupdate.
- **markAllRead batch:** SOGo tidak punya endpoint batch mark-read; `Promise.all(messages.map(markRead))` per uid (folder ≤ 50 baris di UI — aman).

## 2026-08-18 — Login TIDAK boleh block pada kegagalan sesi SMTP

- `registerSmtpSession` (POST `/api/auth/smtp`) dulunya memblokir login: gagal → logout + throw → user terkunci walau SOGo session valid. Ini salah: di dev, `/api` → 127.0.0.1:3001 (backend lokal tak jalan) → login selalu gagal; di production, kalau sogo-smtp-proxy (3005) down → semua user terkunci.
- **Fix:** SMTP session non-blocking — gagal → `smtpToken=null` + `toast.warning`, login lanjut. Baca email tetap jalan; hanya kirim email yang gagal sampai backend SMTP pulih.
- **Pola:** sesi SOGo (login/read) dan sesi SMTP (send) adalah dua hal terpisah — jangan satukan gate-nya. Sama seperti lesson 401/403 `/api/*` ≠ sesi SOGo expired (lihat entri workspace multi-host).

## 2026-08-18 — Klasifikasi email client-side + signature multi-per-akun (sogo-frontend)

- **SOGo list view TIDAK mengembalikan header arbitrer** (List-Unsubscribe, X-Spam-Flag, Precedence, dll) — request `headers` di `buildMessageViewBody` hanya kolom yang dikenal (Subject/From/To/isRead/hasAtt/isFlagged/uid/dll). Karena itu klasifikasi kategori TIDAK boleh bergantung header tambahan; pakai data yang sudah ada: `folderId` (spam = folderJunk), `from` (domain pengirim), `subject` (kata kunci).
- **`src/lib/emailCategory.js`** — `classifyEmail({folderId,from,subject})` → utama/promo/sosial/update/spam. Prioritas: spam (folder) > sosial (domain) > promo (domain/keyword) > update (domain/keyword) > utama. `subjectMatches` pakai batas-kata (`\b`) utk kata pendek (<5 huruf, mis. "sale"/"otp") dan includes utk kata panjang (varian promo/promosi). Kata ambigu (update/login/pin) di-exclude dari keyword update.
- **`src/lib/signatures.js`** — storage multi-signature per-akun localStorage `pcp_signatures_<email>` (pola sama `userPrefs.js`): `{list:[{id,name,html}], defaults:{new,reply}}`. Compose memilih signature via `getSignatureFor(email, 'new'|'reply')` — mode ditentukan `initialData.composeMode` (MessageReader kirim 'reply' utk balasan/forward). Fallback ke `SOGoMailSignature` lama bila belum ada signature lokal (migrasi otomatis di PreferencesPage).
- **Sinkronisasi SOGo:** SOGo prefs hanya support SATU signature (`SOGoMailSignature`); multi-signature hanya client-side. "Sinkronkan ke SOGo" menulis default `new` ke SOGoMailSignature agar klien SOGo native/mobile ikut pakai — opsional, bukan syarat webmail ini.
- **Pattern baru:** tambah field kecil (`folderId`, `composeMode`) ke objek hasil parse — aman, tidak mengubah kontrak API; parse row memakai kolom dinamis (bukan index tetap).

## 2026-08-18 — Dev lokal sogo-frontend: Vite dev server + proxy SOGo produksi

- **`npm run dev`** → Vite di `http://localhost:5173/webmail/` (base `/webmail/`; host 0.0.0.0). Tanpa `.env` lokal — `VITE_SOGO_BASE_URL` default kosong (same-origin) aman; `VITE_API_KEY` hanya utk build production (deploy.sh mengisinya dari mailserver).
- **Proxy Vite (vite.config.js):** `/SOGo` → `https://mail.pcpexpress.co.id` (changeOrigin, `cookieDomainRewrite: {'*':'localhost'}` + strip `Secure`/`SameSite` dari Set-Cookie → cookie sesi SOGo diterima browser di localhost HTTP; hapus `accept-encoding` biar SOGo kirim plain; log `[PROXY →/←]` utk path Mail/connect/logoff), `/api` → `http://127.0.0.1:3001` (butuh server.js lokal + env DB/SMTP — TIDAK jalan tanpa itu; utk review UI/login/baca mail cukup proxy /SOGo).
- **Verifikasi sehat:** `curl http://localhost:5173/webmail/` → 200; `curl -X POST http://localhost:5173/SOGo/connect` (dummy) → 403 = pipeline login sampai SOGo produksi (ditolak wajar). `/SOGo/so/` → 200.
- **Batasan dev:** `/api/*` (kirim email, preferences, health) butuh `server.js` + env (DB Mailcow live) — constraint project-context. Preferences punya fallback localStorage jadi UI tetap jalan.
- **Catatan sandbox terminal agent:** proses background (nohup) MATI saat tool-call selesai — user harus jalankan `npm run dev` di terminal sendiri utk server bertahan.
- **Flow review tanpa deploy:** edit kode → `npm run dev` → buka `localhost:5173/webmail/` → login akun asli (SOGo produksi di belakang proxy) → review → kalau mau, baru deploy via `./deploy.sh`.

## 2026-08-18 — /api/v1/* Mailcow: inject X-API-Key di nginx (jangan hapus saat edit config)

- **`site.control-tower.custom`** punya `location ^~ /api/v1/` → FastCGI `php-fpm-mailcow:9001` → `json_api.php` dengan `fastcgi_param HTTP_X_API_KEY "<MC key>"` — ini membuat request apa pun ke /api/v1/* lolos auth Mailcow (UI Mailcow session-cookie ATAU Control Tower SPA Bearer JWT). **Jangan hapus block ini saat mengedit config** — tanpanya SPA Control Tower dapat body kosong (dashboard halaman Mailcow blank) dan UI Mailcow tetap jalan via json_api template.
- Gate `auth_request` (JWT/X-API-Key ke 3003) yang ditambah 11 Agu di block ini MEMBUNUH UI admin Mailcow (semua /api/v1/* 401) — gate TIDAK boleh dipasang lagi. Kombinasi benar: FastCGI + inject X-API-Key, TANPA auth_request.
- Template Mailcow default: `location ~ ^/api/v1/(.*)$` → `try_files ... /json_api.php?query=$1` (tanpa key) — hanya layani request yang bawa X-API-Key sendiri. `^~` di site.custom menang dari regex template.
- **⚠️ Implikasi keamanan:** /api/v1/* efektif publik (X-API-Key di-inject server-side, tidak pernah ke browser) — siapa pun yang bisa HTTP ke endpoint punya akses penuh API Mailcow. Status quo pra-11 Agu. Mitigasi: batasi source IP/origin atau pisahkan path Control Tower.
- **Tes cepat:** `curl https://mail.pcpexpress.co.id/api/v1/get/mailbox/all` → 200 + JSON data (bukan body kosong) = inject jalan.

## 2026-08-18 — DUA proyek migration portal: imapsync-migrate (ASLI) vs migration-portal (salinan)

- **`/home/anas.fikri/imapsync-migrate` = proyek ASLI/LIVE** (unit systemd 17 Agu menunjuk ke sini): auth `scripts/admin-auth-check.sh` — helper bash baca-only yang verifikasi via `doveadm pw -t` terhadap hash tabel `admin` Mailcow (support SEMUA skema: BLF-CRYPT, SSHA256, SSHA, PLAIN, dll). Env di `.env.server`: `MAILCOW_API_KEY/MAILCOW_ADMIN_USER/MAILCOW_ADMIN_PASS/JWT_SECRET/...` — TIDAK butuh DBUSER/DBPASS. Data: `data/jobs.json` (522 job) + `data/tokens.json` (520 token). Server.js punya security headers + `trust proxy` + rate limit per-IP (login admin) + `assertAdminAuthConfigured()`.
- **`/home/anas.fikri/migration-portal` = salinan TUA**: auth bcryptjs terhadap tabel `admin` (hanya BLF-CRYPT; SSHA256 di-patch manual 18 Agu), env DBUSER/DBPASS/DBNAME dari mailcow.conf, data cuma 1 job. JANGAN dipakai — kalau port 3007 dilayani proyek ini, dashboard kosong.
- **Gejala salah-proyek:** login portal sukses tapi dashboard cuma 1 user / data kosong. Cek `readlink /proc/<pid>/cwd` proses port 3007 + jumlah key `data/jobs.json`.
- **Start yang benar:** `cd /home/anas.fikri/imapsync-migrate && (set -a; source .env.server; set +a; exec /usr/bin/node server.js >> logs/app.log 2>&1) &` (nohup via start.sh sama). Helper script tidak perlu chmod +x (dipanggil `bash script`).
- **Unit systemd** `migration-portal.service` (nama unit historis) harus menunjuk `/home/anas.fikri/imapsync-migrate`; sempat salah diarahkan ke migration-portal (18 Agu 04:26) — kembalikan via sed + daemon-reload (butuh sudo).

## 2026-08-18 — Migration portal butuh env DB; start.sh; unit systemd salah path

- **Portal butuh `DBUSER/DBPASS/DBNAME` di env** (`process.env.DBUSER || "mailcow"` dst. di `src/routes/auth.js`). Kalau `DBPASS` kosong, `mysql -p""` memicu prompt interaktif → `Access denied ... using password: NO` → `verifyAdminPassword` selalu false → **login selalu ditolak walau password benar** (silent — hanya terlihat di `logs/app.log`).
- **Cara start yang benar:** `cd /home/anas.fikri/migration-portal && nohup bash start.sh` (start.sh = `set -a; source .env.server; exec node server.js >> logs/app.log`). Jangan start `node server.js` polos tanpa env.
- **`.env.server` TIDAK berisi DB vars asli** (hanya PORT/NODE_ENV/JWT_SECRET/MAILCOW_API_KEY/SMTP/IMAP/ADMIN_*) — DB vars ditambahkan 2026-08-18 dari `mailcow.conf` (backup `.env.server.bak-20260818-2`).
- **Unit systemd `migration-portal.service` RUSAK:** WorkingDirectory + EnvironmentFile menunjuk `/home/anas.fikri/imapsync-migrate` (seharusnya `/home/anas.fikri/migration-portal`), crash-loop (EADDRINUSE + path salah). Portal dilayani proses nohup; setelah host restart, unit rusak akan start dgn env salah → login rusak lagi. **Perlu sudo utk perbaiki unit** (TODO user).
- **Login admin portal = username BARE** (`anas.fikri`), bukan email — query `admin` table exact match (`username='<user>' AND superadmin=1 AND active=1`).

## 2026-08-18 — Sesi SOGo tinggal di memcached — flush_all cron = logout massal tiap 5 menit

- **SOGo simpan SESI di memcached** (`SOGoMemcachedHost = "memcached"`; key `session:*`, size 2102B; cache lain: `<user>+attributes/defaults/settings`, `/Users/<user>/...`). `flush_all` = semua sesi mati seketika.
- **`sync_sogo_passwords.sh` (cron */5 mnt di host mail) unconditional `flush_all` memcached** — bahkan saat `ROW_COUNT = 0` (UPDATE tidak mengubah apa pun). Efek: seluruh user webmail ke-logout tiap ≤5 menit; race saat login (`/connect` sukses → flush → warm-up `/SOGo/so/...` 403) = error "Sesi SOGo tidak terbentuk" di `warmUpSogoSession()`.
- **Fix 2026-08-18:** flush hanya jika `ROWS > 0` (ada password berubah). SOGo cache hash password di memcached (`<user>+attributes` berisi `"password":"<hash>"`) — itu alasan flush ada; tapi invalidasi cukup saat reset password, bukan tiap tick. Backup: `sync_sogo_passwords.sh.bak-20260818`.
- **Efek samping positif:** `x+failedlogins` (memcached, throttle brute-force) tidak di-reset tiap 5 mnt lagi → deteksi brute force efektif.
- **Diagnosa cepat:** amati key `session:*` memcached sebelum/sesudah cron tick. Nol sesi tepat setelah tick = ada yang flush memcached. (Observed: 03:29 ada 2 sesi → 03:30:20 nol → setelah fix bertahan 4+ tick.)
- **Cara akses memcached:** `docker exec mailcow-memcached-mailcow-1 sh -c "echo 'stats cachedump <slab> 500' | nc 127.0.0.1 11211"`.

## 2026-08-18 — Pitfall CSS: `color-scheme: light dark` vs `prefers-color-scheme`

- `color-scheme: light dark` memberitahu browser utk merender default UI (teks/form/scrollbar) sesuai skema OS — TAPI browser yang tidak support media query `prefers-color-scheme` (beberapa WebView/lama) tetap mengikuti skema gelap utk default text → teks putih di background terang. Halaman statis harus set `color-scheme` eksplisit per skema: default `light` + `dark` di dalam media query, dan beri warna eksplisit utk `a`/elemen default.

## 2026-08-18 — Nginx /api/v1/* konflik Mailcow vs Control Tower

- **Konflik path:** Control Tower dashboard memakai `/api/v1/*` Mailcow. Sejak 11 Agu, `site.control-tower.custom` meng-gate `location ^~ /api/v1/` dgn `auth_request` (JWT/X-API-Key via 3003) + FastCGI langsung ke php-fpm dgn inject X-API-Key → **UI admin Mailcow mati** (semua /api/v1/* 401). Fix 18 Agu: hapus gate → `/api/v1/*` kembali ke Mailcow (template `sites-default.conf.j2`: `location ~ ^/api/v1/(.*)$` → `json_api.php?query=$1`).
- **Login UI Mailcow = `POST /`** (index.php, form `login_user`/`pass_user`, submit via `fetch(window.location.href)`), BUKAN `/api/v1/login` (route tsb 404 di json_api — normal). API v1 = add/edit/get/del (json_api.php).
- **Lokasi config:** `/data/docker-data/mailcow/data/conf/nginx/site.*.custom` di host `mail` → di-mount ke container mailcow-nginx (path sama). `nginx -t` + `nginx -s reload` di container utk apply.
- **Pelajaran:** sebelum menambah `location ^~ /api/v1/` apa pun di Mailcow, ingat bahwa path itu milik UI Mailcow (PHP). Control Tower sebaiknya pakai path sendiri (mis. /control-tower/api) utk tidak mencuri /api/v1/*.

## 2026-08-18 — Migration portal auth: skema password + lokasi

- **Lokasi:** `/home/anas.fikri/migration-portal` di host `mail` (BUKAN innaka), port 3007, nginx `/migrate` → `192.168.10.200:3007` (`site.migration.custom`). Jalan via `nohup node server.js` (cwd migration-portal). Route login: `POST /migrate/api/auth/login`.
- **Auth:** `verifyAdminPassword` query `admin` table (`superadmin=1 AND active=1`), parse `{SCHEME}hash`. Sebelumnya HANYA bcryptjs — support `{BLF-CRYPT}` saja efektif; `{SSHA256}` (digest32+salt16, LDAP-style) TIDAK bisa diverifikasi → login selalu gagal walau password benar. Patch 2026-08-18: `verifySsha256()` via `createHash('sha256')` + `timingSafeEqual`.
- **Tabel admin** Mailcow berisi: admin/anas.fikri/abdul.latif/mohamad.hidayat/yudhis/dedy.sugiarto = `{BLF-CRYPT}`, admin@pcpexpress.co.id = `{SSHA256}`. Password `AdminMail2026!` (docs 05 Agu) TIDAK lagi match hash `admin` — sudah berubah.
- **Mailbox** 615 akun = `{BLF-CRYPT}` (bcrypt cost beragam, termasuk $2y$05$). `{RESOURCE}` = resource account (bukan user).

## 2026-08-18 — Arsitektur anti-abuse mail server (PCP Express)

- **Dua lapis ban:** (1) MikroTik `spam-blocklist` (address-list) diisi `/home/anas.fikri/spam-detect.sh` di host `mail` (cron */2 mnt): block IP dengan ≥5 SASL failed/5mnt, ≥20 conn, ≥10 deferred, atau ≥5 IP unik satu /24 (password spray → block subnet /24). Whitelist: `WL_EXACT` + `WL_PREFIX` (default: 202.148.2., 192.168.10., 10.100.100., 127.0.0.; kami tambah `115.178.128.` utk IP kantor D-NET). State di `/tmp/spam-blocked-ips.txt` + `/tmp/spam-blocked-subnets.txt`. (2) **CrowdSec** (`mailcow-crowdsec-1`) ban IP via netfilter (postfix-spam/dovecot-spam dll). Allowlist permanen via `cscli allowlists create kantor` + `add` — efektif utk decision berikutnya.
- **False positive umum:** IP NAT kantor (115.178.128.130, D-NET AS9794) sering ke-ban karena mesin/aplikasi di kantor login-loop dgn kredensial lama → user kantor mati total (timeout semua port). Gejala "loading terus dari kantor" = cek MikroTik `spam-blocklist` + CrowdSec decisions DULU sebelum cek DNS/firewall lain.
- **Access router MikroTik:** dari mac: `ssh -J mailserver -i ~/.ssh/id_rsa_mikrotik -p 2002 antigravity@192.168.10.1` (Port 2002, user antigravity; Publik 202.148.2.138). NAT dst: 202.148.2.139/141/142 → 192.168.10.200 (mail); 202.148.2.140 → 192.168.20.200.
- **SOGo auth:** `_sogo_static_view.c_password` = copy `mailbox.password` (bcrypt {BLF-CRYPT}, salt acak). Sync via `/home/anas.fikri/sync_sogo_passwords.sh` (cron */5 mnt, UPDATE JOIN WHERE m.active=1 + flush memcached). Password mismatch SOGo/Dovecot = cek sync ini + `mailbox.active`.
- **Password SSO internal:** string 32-char hex di log SOGo (`1 login "user" "lt0qcqr9..."`) = password SSO Mailcow (`conf/phpfpm/sogo-sso/sogo-sso.pass`, `conf/sogo/cron.creds`, `conf/dovecot/sogo-sso.conf`) — BUKAN password user. Jangan salah simpulkan "semua user password sama".
- **Diagnosa auth massal:** `docker logs mailcow-dovecot-mailcow-1 | grep "auth.*failed"` → hitung per hari utk baseline (normal 400–600/hari dari brute force bot; 16 Agu 9271 = ledakan attack).

## 2026-08-18 — Workspace multi-host + sesi SMTP proxy vs sesi SOGo

- **Repo dijalankan dari banyak host** (mac `sogo-frontend`, server innaka `/home/anas.fikri/mailcow-frontend`, dst.) yang semuanya push ke GitLab yang sama. Sebelum mulai kerja: `git fetch` + cek `git log` remote (atau SSH ke host lain) — workspace mudah tertinggal beberapa commit.
- **401/403 dari `/api/*` ≠ sesi SOGo expired.** `/api/*` (preferences/send/auth/smtp) di-proxy `sogo-smtp-proxy` (port 3005) yang punya sesi SMTP sendiri (`X-SMTP-Token`, UUID in-memory). Token hilang saat reload halaman (dulu hanya memory), idle 30 menit, atau proxy restart → 401/403. Memperlakukan itu sebagai session-expired SOGo = force logout + mailbox kosong + login berulang. `fetchPreferences` kini fallback ke localStorage (resolve, bukan reject) tanpa memicu `onSessionExpired`.
- **`smtpToken` di-persist ke localStorage** (authStore partialize `pcp-auth`): UUID sesi, bukan kredensial (user+pass tetap tidak pernah dipersist). Tradeoff diterima: XSS bisa pakai token utk `/api/send`, tapi token berumur pendek (8 jam / 30 mnt idle) dan dicabut saat logout/restart proxy.
- **SOGo `/send` = 501** → `/api/send` (butuh smtpToken) adalah satu-satunya jalur kirim yang bekerja; tanpa token, kirim email gagal setelah reload.
- **Operasional:** proxy 3005 pernah di-restart via `nohup` manual (beberapa proses `node server.js` orphan, satu di port 3001) — setiap restart menghapus semua `smtpSessions` in-memory. Konsolidasi proses proxy direkomendasikan.
- Test regression: `scripts/test-preferences-fallback.mjs` (`npm run test:preferences-fallback`) — mock fetch, memastikan 401/403 resolve null tanpa session-expired, 200 mengembalikan data, guard email kosong skip fetch.

## 2026-08-18T02:33:56Z
- Task: sync-innaka-workspace-2026-08-18
- Status: COMPLETED
- Finding: Sinkronisasi multi-host: repo dipush dari mac + server innaka; selalu fetch+cek log sebelum kerja. 401/403 dari /api/* adalah sesi SMTP proxy (X-SMTP-Token), bukan sesi SOGo — tidak boleh picu logout; fetchPreferences fallback localStorage. smtpToken kini dipersist (UUID sesi, bukan kredensial) agar reload tidak memutus kirim/preferences. Test regression test:preferences-fallback. Validasi: 15/15 test PASS + build OK di workspace mac.

## 2026-08-18T02:59:14Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: INCIDENT login massal 2026-08-18. Kantor timeout: MikroTik spam-blocklist (spam-detect.sh, cron */2mnt, threshold 5 SASL fail/5mnt) + CrowdSec ban false positive — resolved via unban + allowlist + whitelist prefix 115.178.128. Cabang Login ditolak = password user tidak cocok (bukan bug), plus brute force 16 Agu 9271 attempt. String lt0qcqr9 di log SOGo = SSO password internal, bukan password user. Backup spam-detect.sh.bak-20260818.

## 2026-08-18T03:15:00Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: Root cause admin Mailcow ga bisa login: gate auth_request di site.control-tower.custom (location ^~ /api/v1/) sejak 11 Agu blokir semua API Mailcow. Fix: hapus gate, nginx -t + reload, /api/v1/* balik ke Mailcow json_api. Login UI Mailcow = POST / (login_user/pass_user), bukan /api/v1/login (404 normal). Password admin tdk match AdminMail2026! (docs outdated). Backup: site.control-tower.custom.bak-20260818.

## 2026-08-18T03:51:24Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: ROOT CAUSE Sesi SOGo tidak terbentuk: sync_sogo_passwords.sh (cron */5mnt) unconditional flush_all memcached tiap 5 menit — sesi SOGo tersimpan di memcached, jadi semua user webmail ke-logout tiap ≤5 menit + race saat login (connect sukses -> flush -> warm-up 403). Fix: flush hanya jika ROW_COUNT>0 (ada password berubah). Terbukti: sebelum fix sesi hilang tepat setelah cron tick (03:30 nol sesi), setelah fix sesi bertahan 4+ tick (03:35-03:50). Backup sync_sogo_passwords.sh.bak-20260818. Bonus: x+failedlogins (throttle brute-force) tidak di-reset tiap 5 menit lagi.

## 2026-08-18T03:57:13Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: Migration portal login selalu ditolak walau password benar: proses restart nohup tanpa memuat .env.server -> DBPASS kosong -> mysql -p"" prompt interaktif -> Access denied -> verifyAdminPassword false. Fix: tambah DBUSER/DBPASS/DBNAME ke .env.server dari mailcow.conf + chmod +x start.sh + restart via nohup bash start.sh. Unit systemd migration-portal.service salah path (imapsync-migrate) crash-loop 545x — perlu sudo utk perbaiki (TODO). Login portal = username bare bukan email. Backup .env.server.bak-20260818-2.

## 2026-08-18T04:32:10Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: Dashboard migration portal kosong: ada DUA proyek — imapsync-migrate (ASLI, 522 job/520 token, auth doveadm helper via admin-auth-check.sh, env MAILCOW_API_KEY dkk) vs migration-portal (salinan tua bcryptjs 1 job). Saya restart proyek salah (migration-portal) sehingga dashboard tampil kosong. Fix: kill proses migration-portal, start imapsync-migrate (pid 670022) dengan source .env.server. Verifikasi: stats 522/408/114, health 200, helper HASH anas.fikri OK. TODO user sudo: unit systemd migration-portal.service harus menunjuk imapsync-migrate (sempat diarahkan ke migration-portal 04:26).

## 2026-08-18T04:41:44Z
- Task: incident-login-massal-2026-08-18
- Status: COMPLETED
- Finding: Control Tower mailboxes kosong: patch hapus gate /api/v1 (18 Agu) ikut menghapus location ^~ /api/v1/ FastCGI + inject X-API-Key server-side — SPA Control Tower dapat body kosong dari json_api tanpa key. Fix: restore block FastCGI + HTTP_X_API_KEY (tanpa gate auth_request yang membunuh UI Mailcow). Verifikasi: mailbox/all 919KB, domain/all 4.5KB, passwordpolicy/html 200, UI Mailcow POST / Login failed normal. Pelajaran: jangan hapus inject X-API-Key di site.control-tower.custom; gate auth_request JANGAN dipasang lagi. Catatan keamanan: /api/v1/* efektif publik (status quo pra-11 Agu).

## 2026-08-18T05:11:26Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: Klasifikasi email client-side (emailCategory.js: spam=folder Junk, sosial=domain medsos, promo=domain newsletter+keyword subjek, update=domain no-reply+keyword; SOGo list view tidak kirim header arbitrer jadi klasifikasi pakai folderId+from+subject saja). Signature multi-per-akun localStorage (signatures.js, pola userPrefs): default terpisah new/reply, dropdown sisipkan di compose, migrate otomatis dari SOGoMailSignature, sync ke SOGo opsional. 17/17 test PASS + build OK, BELUM deploy (dev localhost:5173).

## 2026-08-18T05:29:53Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: Login TIDAK boleh block saat registerSmtpSession gagal: SMTP session non-blocking (smtpToken=null + toast.warning), login lanjut — sesi SOGo (read) dan SMTP (send) terpisah. Fix di LoginPage.jsx; di dev /api ke 127.0.0.1:3001 (backend lokal tak ada) jadi kirim email gagal tapi baca email OK; production via nginx->3005 tidak berubah. Build OK + login-flow/preferences-fallback PASS.

## 2026-08-18T05:35:52Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: Kontrol baris pesan MailPage dirapikan: checkbox menggantikan avatar saat hover/seleksi (pola Gmail, cross-fade, bg-background+border biar jelas), star pindah ke kanan sebelah tanggal. Tidak ada lagi overlay dua tombol di atas avatar 32px. Build OK + HMR, belum deploy.

## 2026-08-18T05:37:54Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: Range-select checkbox (Shift+klik) di MailPage: anchor lastSelectedUid useRef, urutan tampil visibleOrderUids (flat sortedMessages atau flatten conversationGroups), selectRangeFromAnchor pilih semua antara anchor dan target + union seleksi, anchor ikut pindah. Reset anchor saat ganti folder/search. Build OK + HMR, belum deploy.

## 2026-08-18T05:47:11Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: HtmlEditor dapat kontrol ukuran font (dropdown A): execCommand styleWithCSS+fontSize (1-6) -> span style font-size yang lolos DOMPurify karena 'style' di ADD_ATTR PURIFY_CONFIG. Terpasang di toolbar HtmlEditor yang dipakai SignatureSection. Build OK + HMR, belum deploy.

## 2026-08-18T05:54:55Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: 5 fitur produktivitas sogo-frontend: (1) notifikasi email baru via polling unseen + Notification API + tab title badge; (2) filter belum dibaca client-side; (3) tandai semua dibaca = Promise.all markRead per uid (SOGo tak punya batch); (4) arsip cepat ke folder root Archive yang ADA di semua akun (doveadm verified); (5) draft autosave SOGo: GET /Mail/0/compose -> draftId, POST folderDrafts/{id}/save, hapus draft setelah kirim via batchDelete. 18/18 test PASS + build OK, belum deploy.

## 2026-08-18T06:03:27Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: 5 fitur harian sogo-frontend: (1) snooze client-side localStorage {uid:wakeEpoch}, sembunyi dari daftar + prune 60s, tanpa folder server; (2) badge per folder via getUnseenCount(folder) Promise.allSettled junk/sent/drafts; (3) quick reply di reader via sendMessage biasa; (4) unduh semua lampiran window.open tiap downloadURL; (5) cari per pengirim klik nama -> search criteria 'from'. 19/19 test PASS + build OK, belum deploy.

## 2026-08-18T06:06:36Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: TDZ bug di React: const useMemo yang dipakai di filter useMemo lain harus dideklarasikan LEBIH DULU (JS hoisting hanya function declarations, bukan const). MailPage: displayMessages pakai snoozedUids tapi snoozedUids dideklarasikan setelahnya -> crash render. Fix: pindah ke atas. 19/19 test PASS + build OK.

## 2026-08-18T06:16:10Z
- Task: fitur-klasifikasi-email-signature-2026-08-18
- Status: COMPLETED
- Finding: SOGo v5 search = POST /Mail/0/{folder}/view + body filters [{searchBy, searchInput, negative}] — endpoint /search TIDAK ADA (404 verified log nginx). searchBy valid: subject_or_from, subject_or_to, contains, body, from, to, subject. Diverifikasi dari kode SOGo asli Mailer/Mailbox.service.js di container mailcow-sogo-mailcow-1. Fix buildMessageSearchBody + searchMessages -> /view. 19/19 test PASS + build OK.

## 2026-08-18T06:22:17Z
- Task: fix-bugs-fitur-baru-deploy-2026-08-18
- Status: COMPLETED
- Finding: SOGo v5 move = POST moveMessages body {uids, folder: path relatif} (Archive, INBOX/Sub), bukan batchMoveToMailbox (0 hit di binary MailerUI) — fix 404 archive; caller kirim objek folder, string id di-decode. Audit endpoint lain (markMessage*, batchDelete) valid. 19/19 test + build OK.

## 2026-08-18T07:30:46Z
- Task: fitur-harian-batch2-2026-08-18
- Status: COMPLETED
- Finding: Batch 2 fitur harian sogo-frontend: (1) auto-advance reader via siblingUids+onNavigateTo (buka pesan berikutnya setelah hapus/arsip); (2) group by tanggal di daftar (dateGroups.js, parser toleran ISO/RFC/epoch/today/yesterday, bucket Hari Ini/Kemarin/Minggu Ini/Bulan Lalu/Lebih Lama, 32 test); (3) tambah ke kontak dari email (POST Contacts/personal/new {c_cn,c_mail,c_telephonenumber}, prefill from[0]/to[0]); (4) kalender: klik sel=pilih + tombol + per sel; (5) rule Jalankan Sekarang = matchRules+fetchMessages INBOX+moveMessages. 20/20 test + build OK. BELUM deploy.

## 2026-08-18T10:13:20Z
- Task: fitur-harian-batch2-2026-08-18
- Status: COMPLETED
- Finding: Comprehensive bug audit: (1) RulesPage handleRunNow referenced allFolders/handleRefresh before declaration (TDZ fragile); fix: reorder all deps before usage. (2) addRule + saveRules silently drop rules when email is empty — toast shows success but nothing saved; fix: throw error + guard in QuickRuleModal. (3) RulesPage handleRunNow passed raw string rule.actionFolder to moveMessages; fix: resolve via folderById → object. (4) Pattern lesson: localStorage silent fail is dangerous — always validate email param in save functions. Cross-component data consistency: ensure A saves and B reads same key format.

## 2026-08-18T12:37:56Z
- Task: fitur-harian-batch2-2026-08-18
- Status: COMPLETED
- Finding: SOGo v5 moveMessages expects absolute folder path in body (e.g. /anas.fikri@pcpexpress.com/folderArchive), not just 'Archive' or 'folderArchive'. Sending relative path causes HTTP 500. Also: ErrorBoundary now shows error details in production for debugging; removed 'N aturan' badge from folder header to save space.

## 2026-08-18T13:28:14Z
- Task: 20260818-125516-114124
- Status: COMPLETED
- Finding: Bug hunt loop (5 pass) found 7 bugs: (1) visibleCount not reset on folder change, (2) snoozedUids pruneExpired side effect in useMemo, (3) focusIdx out-of-bounds when messages change, (4) quick reply missing recipient validation, (5) RulesPage toast shows raw folder ID, (6) executeRules silent error no toast, (7) autoArchive body field always fails (SOGo list view has no body). All fixed + 20/20 tests pass.

## 2026-08-18T14:29:24Z
- Task: 20260818-142155-180721
- Status: COMPLETED
- Finding: Bug hunt round 2: verified no infinite loop from focusIdx clamp (removed focusIdx from deps), pruneExpired only in useEffect (not useMemo), all effects have proper cleanup. React #310 error was caused by focusIdx dep in clamp effect creating interaction with reset effect. All 20/20 tests pass.

## 2026-08-18T14:45:38Z
- Task: 20260818-142155-180721
- Status: COMPLETED
- Finding: React #310 root cause: markRead inside queryFn called queryClient.invalidateQueries → cascading re-renders. Fix: move markRead to useEffect with stable deps [msg?.uid, user?.sogoToken, folder, msgId]. Bundle hash changed to MailPage-DZ-tVu2G.js (confirming new code deployed).

## 2026-08-18T14:54:21Z
- Task: 20260818-142155-180721
- Status: COMPLETED
- Finding: React #310 persistent: markRead useEffect still fires on re-render despite moving from queryFn. Fix: added ref guard (markReadFired) to ensure markRead only fires ONCE per mount. Bundle hash changed to MailPage-BJ_MUnUD.js.

## 2026-08-18T15:00:54Z
- Task: 20260818-142155-180721
- Status: COMPLETED
- Finding: React #310 ROOT CAUSE: contactNameRef/contactEmailRef/contactPhoneRef (useRef) were declared AFTER early return at line 337 (if (!msgId) return null). React sees different hook count between renders → Rules of Hooks violation → React #310. Fix: move all useRef to BEFORE early returns.

## 2026-08-18T22:55:00Z
- Task: fix-moveMessages-500
- Status: COMPLETED
- Finding: SOGo moveMessages 500 error caused by UIDs being sent as strings instead of integers. `parseMessageRow` returns raw value from JSON response (could be string or number). SOGo backend expects `{uids: [int, ...]}`. Fix: normalize UIDs via `parseInt()` in moveMessages, filter invalid UIDs, capture SOGo response body on error for debugging. Also corrected knowledge entry: SOGo moveMessages expects absolute folder path in body (e.g. `/anas.fikri@pcpexpress.com/folderArchive`), NOT relative path. Previous knowledge entry saying "path relatif" was incorrect.

## 2026-08-18T16:08:05Z
- Task: 20260818-142155-180721
- Status: COMPLETED
- Finding: moveMessages 500 fix: SOGo backend expects uids as integer array. parseMessageRow returns raw value from JSON (could be string). Added parseInt normalization + invalid UID filtering. Also capture SOGo response body on error for debugging. Corrected knowledge entry: SOGo moveMessages expects absolute folder path (e.g. /anas.fikri@pcpexpress.com/folderArchive), NOT relative path.

## 2026-08-19 — Endpoint native SOGo: junk/spam + subfolder + struktur parts

- **Native spam SOGo (dari `UIxMailFolderActions.m`):** `POST /so/{user}/Mail/0/{folder}/markMessagesAsJunk` body `{"uids":[int]}` → 204; kebalikan `markMessagesAsNotJunk`. Native jauh lebih baik daripada move manual ke folder Junk — SOGo set flag Junk + pindahkan sekaligus, klasifikasi spam (Rspamd/Mailcow) tetap berfungsi. Folder id pakai `pathSegment` + `allowEncodedSlash` (pola `moveMessages`).
- **Subfolder SOGo:** `POST /so/{user}/Mail/0/{parentFolder}/createFolder` body `{"name":"Sub"}` → 204/500 `{message}` (nama duplikat → error body dimasukkan ke toast); `POST /so/{user}/Mail/0/{folder}/delete` body `{"withoutTrash":true}` → 204 hapus PERMANEN (tanpa `withoutTrash` = pindah Trash). Action lain tersedia: `renameFolder` `{"name"}`, `moveFolder`, `setAsJunkFolderAction`.
- **`msg.parts` bisa ARRAY langsung** (bukan object `{type, content:[...]}`): dari `UIxMailPartViewer.m renderedPart` + `UIxMailPartMessageViewer` (top-level `{type, content:[...]}` TANPA contentType). Semua fungsi extract (`extractHtml`/`extractAttachments`/`extractInlineImages`) WAJIB guard `Array.isArray(parts)` di TOP — tanpa itu, cek `parts.contentType` pada array = undefined → attachment/body tidak pernah tampil (bug "lampiran tidak muncul").
- **`size` part SOGo = STRING terformat** ("1.2 MB") bukan bytes: `formatFileSize` harus handle string (tampilkan langsung); hanya number yang diformat ulang. `dictionaryWithObjectsAndKeys` (ObjC) berhenti di nil pertama — part teks tanpa filename TIDAK punya downloadURL (filter `!isInline` redundan tapi harmless).
- **Struktur leaf part:** `{type, contentType, content, filename, extension, size, viewURL, downloadURL, shouldDisplayAttachment}`. MixedViewer → `content` array; AlternativeViewer → `{content, preferredPart}`; Image/Link/Text/HTML viewer TIDAK override renderedPart (inherits base). Download fallback `downloadURL || viewURL`.
- **Verifikasi source:** deployed SOGo bundle == master source (checksum `372f2e21…` Message.service.js, `aa1f7a75…` MessageController.js, build `@localhost 20260611`) — ground truth valid tanpa akses live.

## 2026-08-19T10:30:43Z
- Task: 20260819-103030-365882
- Status: COMPLETED
- Finding: Lampiran: URL /SOGo/ same-origin bisa di-fetch credentials:'include' lalu blob + anchor download (hindari popup blocker/N tab). SOGo size part = string '1.2 MB' → parseSizeToBytes (B/KB/MB/GB/TB/KiB/MiB/GiB/TiB + koma desimal) utk total ukuran. Ikon tipe file via lucide File* family + getFileKind (ext + contentType).; Infinite scroll inbox: IntersectionObserver + sentinel bawah list; batas 5 bulan filter client-side parseMessageDate (date SOGo = ISO/RFC/literal/epoch). SOGo list view default ~250 row — pagination server-side butuh offset/limit (buildMessageViewBody sudah dukung limit+offset).; scripts/test-*.mjs ke-gitignore (rule test-*) tapi test files tetap di-commit di repo ini (test-mailbox-tree/message-html) → pakai git add -f utk test baru.

## 2026-08-19T10:45:22Z
- Task: 20260819-104513-330340
- Status: COMPLETED
- Finding: Preview lampiran WAJIB pakai URL langsung /SOGo/ (same-origin 'self'), BUKAN blob: URL — CSP img-src 'self' data: https: & default-src 'self' (frame-src fallback) memblokir blob:. URL.createObjectURL hanya aman utk anchor download (navigasi, bukan render). SOGo part punya viewURL (inline) + downloadURL terpisah — simpan keduanya: viewURL utk preview, downloadURL utk unduh.

## 2026-08-19T11:00:07Z
- Task: 20260819-105957-306646
- Status: COMPLETED
- Finding: SOGo leaf part punya shouldDisplayAttachment (boolean): false = gambar inline (CID) di body, true = lampiran asli. extractAttachments harus skip part dengan shouldDisplayAttachment === false agar gambar inline tidak diduplikasi di daftar Lampiran. Gambar inline tetap di-render di body via resolveCidImages (extractInlineImages). Filter lampiran pakai msg.hasAtt (kolom hasAttachment di SOGO_MESSAGE_HEADERS).

## 2026-08-19T13:08:29Z
- Task: 20260819-130705-700312
- Status: COMPLETED
- Finding: .gitignore rule 'test-*' diam-diam mengabaikan suite test resmi scripts/test-*.mjs — 5 test yang dirujuk package.json (email-category/signatures/draft-api/snooze/date-groups) tidak pernah ter-commit; fix dengan exception !scripts/test-*.mjs; ErrorBoundary REGRESI dari fix Round 3: menampilkan error.message + componentStack ke user lagi (info disclosure). Hapus detail di layar, pertahankan console.error + localStorage pcp_last_error; CSP webmail/API kurang object-src 'none' dan frame-src 'self' eksplisit (frame-src dibutuhkan iframe preview PDF lightbox); tambah Permissions-Policy (camera/mic/geolocation/payment/usb off); npm audit --omit=dev = 0 vulnerabilities (dompurify 3.4.13); safeUrl.js/pathSegment.js/DOMPurify/escapeHtml terverifikasi aman — semua sink innerHTML/document.write sudah sanitized

## 2026-08-19 — image proxy (anti tracking-pixel)
- Status: DONE (siap deploy)
- Finding: Gambar eksternal email di-proxy server-side via GET /api/image-proxy agar IP user tidak bocor ke pengirim. SSRF guard di src/lib/ssrfGuard.js (klasifikasi IP privat/reserved murni tanpa dep Node, fail-closed) dipakai server.js untuk blokir fetch internal; DNS rebinding dicegah dengan pin lookup (koneksi ke IP hasil resolusi pertama yang tervalidasi, bukan resolusi ulang). Route /api/image-proxy wajib didefinisikan SEBELUM app.use('/api', requireApiKey) karena <img> tidak bisa kirim header X-Api-Key. CSP img-src diketatkan jadi 'self' data: agar vektor non-<img> (CSS background-image, srcset, picture/source) fail-closed. Frontend proxyExternalImages dipakai HANYA di path render (displayHtml); quote balasan/forward & compose tetap pakai URL asli karena dikirim sebagai email.

## 2026-08-19 — server.js SMTP proxy audit (rate-limit + session hardening)
- Status: DONE (siap deploy)
- Finding: Validasi email server.js diperkuat — tolak SEMUA karakter kontrol (0x00–0x1F + DEL), bukan hanya CRLF (cegah header injection lone-`\n`/`\0`). Di-extract ke src/lib/emailValidation.js (pure) + test:email-validation. Rate limiter kini kirim header `Retry-After`. Session SMTP: TTL/idle/cap per-user configurable via env `SMTP_SESSION_TTL_MIN`/`SMTP_SESSION_IDLE_MIN`/`SMTP_SESSION_MAX_PER_USER` (default 480/30/10) + evict session tertua per user. `clientIp` bisa diketatkan via `TRUSTED_PROXY_IPS` (exact IP, koma) — fallback tetap 172.16/12. Header `/api/*` kini sertakan `Referrer-Policy` + `Permissions-Policy`. Risiko diterima: password plaintext di memori (8 jam) karena nodemailer butuh kredensial; smtpToken di localStorage bisa dicuri lewat XSS → mitigasi TTL pendek + rate limit kirim per IP.

## 2026-08-19T13:47:29Z
- Task: 20260819-134645-308275
- Status: COMPLETED
- Finding: deploy.sh setup_nginx() menulis konfig nginx HARDCODED (heredoc), bukan membaca configs/site.webmail.custom — kalau dua sumber ini beda, deploy akan menimpa hardening di server. Harus selalu disinkronkan keduanya.

## 2026-08-19T14:13:57Z
- Task: 20260819-140923-110737
- Status: COMPLETED
- Finding: deploy.sh setup_nginx() dulu memelihara heredoc nginx TERPISAH dari configs/site.webmail.custom (dua sumber) — drift bisa menimpa hardening saat deploy. Kini single source + sed substitusi port. Backend server.js + modul import lokal TIDAK ikut ter-deploy oleh deploy.sh sebelumnya — harus di-sync manual; kini otomatis di deploy_backend() dengan hash-change guard.

## 2026-08-19T14:17:46Z
- Task: 20260819-141730-202327
- Status: COMPLETED
- Finding: deploy.sh verify_image_proxy() memvalidasi anti tracking-pixel secara live pasca-deploy: cek SSRF guard pakai URL internal (127.0.0.1 → wajib 403, deterministik, tanpa perlu koneksi keluar server) + smoke test gambar eksternal (non-fatal warn karena tergantung egress network). Fungsi warn() di deploy.sh sebelumnya dipanggil (ensure_ssh) tanpa definisi — latent bug, kini terdefinisi.

## 2026-08-19T14:22:30Z
- Task: 20260819-142017-382878
- Status: COMPLETED
- Finding: Alias SSH produksi kini 'deploy-mail' (SERVER=deploy-mail ./deploy.sh); 'mailserver' tidak lagi resolve dari workspace. docs/ai sempat basi: masih mengklaim deploy BLOCKED/NOT LIVE dan CSP img-src 'self' data: https: — sudah dikoreksi ke state LIVE (HEAD 2feb96c). Decision log bersifat historis: entry lama dipertahankan dan hanya ditandai superseded, bukan ditulis ulang.

## 2026-08-19T14:26:55Z
- Task: 20260819-142636-337630
- Status: COMPLETED
- Finding: DOMPurify EMAIL_PURIFY_CONFIG sudah mengizinkan tag picture/source + srcset, jadi HTML email bisa memuat gambar via srcset dan <picture><source>; rewrite berbasis DOM API (template.content.querySelectorAll) aman dari injection. rewriteSrcset harus mempertahankan whitespace asli antar kandidat (split koma) dan hanya rewrite kandidat http(s). rewriteCssUrls pakai regex url(...) dengan backreference quote agar quote asli dipertahankan.

## 2026-08-19T14:38:25Z
- Task: 20260819-143808-382111
- Status: COMPLETED
- Finding: linkedom = DOM Node kecil (0.18.13, zero-dep) untuk menguji fungsi DOM-based (proxyExternalImages) tanpa browser. Catatan penting: getter innerHTML pada HTMLTemplateElement di linkedom TIDAK merefleksikan mutasi content (innerHTML menyimpan salinan asli) — gunakan wrapper <div> agar serialisasi konsisten antara browser & Node. Puppeteer Chrome TIDAK ter-download (cache dir kosong) jadi bukan opsi untuk test unit DOM.

## 2026-08-19T14:56:49Z
- Task: 20260819-145627-255339
- Status: COMPLETED
- Finding: Node http.request timeout = idle timeout, BUKAN total deadline — slow-drip upstream (1 byte tiap <10s) lolos dan menahan koneksi image-proxy tak terbatas. Mitigasi: deadline absolut Date.now()+10s dihitung sekali, diteruskan ke tiap hop, stream di-destroy saat lewat. sendMessage SOGo /send non-ok: fallback ke /api/send harus dibatasi ke 501 saja — status 4xx/5xx lain = SOGo sudah memproses, fallback = risiko kirim ganda.

## 2026-08-19T15:06:15Z
- Task:
- Status: COMPLETED
- Finding: smtpToken dipindah dari localStorage ke cookie httpOnly (smtp_session): HttpOnly+SameSite=Strict+Path=/api+Secure+Max-Age=TTL. server.js /api/auth/smtp POST kini Set-Cookie + return {ok:true}; DELETE clear cookie; requireSmtpSession//api/send baca cookie dengan fallback header/body (kompatibilitas deploy bertahap). Frontend: authStore hapus smtpToken state; api.js registerSmtpSession/revokeSmtpSession/sendMessage/fetchPreferences/logout tidak lagi pegang/kirim token (credentials:'include'). Helper murni src/lib/smtpCookie.js (parseCookies/build/clear) + test:smtp-cookie. CSRF dipertahankan via SameSite=Strict + X-Api-Key (custom header → preflight). Catatan: dev lokal http butuh COOKIE_SECURE=false bila server.js dijalankan manual. 26/26 test PASS + build OK.

## 2026-08-19T15:15:17Z
- Task:
- Status: COMPLETED
- Finding: Hardening paste-XSS + anti tabnabbing pada webmail: PURIFY_CONFIG.ALLOWED_URI_REGEXP mengizinkan data: (utk img base64 composer) tapi DOMPurify tidak membedakan per-atribut, sehingga <a href="data:text/html,..."> dari paste lolos sanitasi (phishing payload). Fix: hook DOMPurify afterSanitizeAttributes hardenAnchorNode(node) — hapus data: href pada <a> + paksa rel=noopener noreferrer pada <a target=_blank> (anti tabnabbing window.opener). Hook dipasang sekali di pasteUtils.js (import oleh MessageReader/HtmlEditor/ComposeModal) sehingga berlaku utk render email + editor. DOMPurify TIDAK bisa jalan di Node/linkedom (linkedom tanpa document.implementation → isSupported false → sanitize no-op), jadi test murni ke logic hardenAnchorNode via linkedom + mock addHook utk registerPurifyHardening. 27/27 test PASS + build OK. deploy.sh BACKEND_LIB_FILES += smtpCookie.js (ikut commit ini).

## 2026-08-19T15:21:04Z
- Task:
- Status: COMPLETED
- Finding: Ekstraksi fetch image proxy dari server.js ke src/lib/remoteImage.js (parseImageProxyUrl/resolveSafeAddresses/pinLookup/requestImageOnce/fetchRemoteImage) dgn opsi injectable timeoutMs/maxBytes/maxRedirects/resolve agar testable. Bonus bug fix DoS: branch remaining<=0 di requestImageOnce dulu destroy res tanpa settle promise → await hang selamanya; kini reject 504. Test DoS test:remote-image: (1) slow-drip 1 byte/50ms tanpa selesai → hard deadline potong 504 <3s (bukan hang), (2) happy path gambar valid sukses, (3) headers lewat deadline → reject 504. Resolver injectable bypass SSRF guard (127.0.0.1) utk test lokal. server.js kini import fetchRemoteImage; import dns/http/https/isBlockedIp dihapus. deploy.sh BACKEND_LIB_FILES += remoteImage.js. 28/28 test PASS + build OK.

## 2026-08-19T15:26:26Z
- Task:
- Status: COMPLETED
- Finding: Rekonsiliasi docs (G-001.S-002): goals.md tambah G-001.S-010 (smtpToken cookie httpOnly + paste-XSS/tabnabbing + DoS slow-drip test, 482df26..3cd39af, 28/28 test); G-002.S-002 status PENDING→BLOCKED (butuh kredensial Eranya asli + tes browser, tanpa akses agen). next-tasks.md entry auto-generated basi diganti akurat (#1 G-002.S-002 blocked, #2 backlog rotasi password + history scrub). handoff.md prepend entry Security batch 2 (DEPLOYED) + BACKEND_LIB_FILES terbaru (ssrfGuard, emailValidation, smtpCookie, remoteImage).

## 2026-08-20T10:05:21Z
- Task: 20260820-100501-388715
- Status: COMPLETED
- Finding: Webmail attachments: Paperclip disabled 'belum didukung' — fitur belum ada. Implementasi: attachmentValidation.js (pure, 10 file/4MB/file/18MB total, base64+filename anti-injection), /api/send zod+validate+nodemailer Buffer.from(base64), express.json 10mb->30mb, sendMessage bypass draft SOGo bila ada lampiran (SOGo /send 501 di produksi -> semua kirim nyata via SMTP proxy). ComposeModal: FileReader->base64, chip list, drag-drop non-gambar->attachment (gambar tetap inline), StrictMode: side effect FileReader di luar updater setState. Bug test time-dependent: parseMessageDate('yesterday') pakai new Date() nyata bukan now inject -> tambah param now (dateGroups.js).

## 2026-08-20T10:49:59Z
- Task: 20260820-104931-250388
- Status: COMPLETED
- Finding: Kalender tidak bisa buat event: src/lib/api.js memakai kontrak SOGo salah. (1) Action name 'saveAsappointment' harusnya 'saveAsAppointment' (capital A, case-sensitive) — dari SOGo Component.service.js 'saveAs'+type.capitalize(). (2) Payload pakai kolom DB c_title/c_location/c_description/c_isallday/c_partmails/c_partstates, padahal SOGo saveAsAppointment membaca field iCal summary/location/comment/isAllDay/attendees(array) — dari iCalEntityObject+SOGo.m & iCalEvent+SOGo.m setAttributes:inContext:. attendees: string koma -> array {email,name,role:'REQ-PARTICIPANT',partstat:'NEEDS-ACTION'}. update pakai action 'save' (benar). newguid response JSON {id} atau plain string. SOGo field date: startDate/startTime/endDate/endTime (string YYYY-MM-DD/HH:MM) + isAllDay bool.

## 2026-08-20T10:56:23Z
- Task: 20260820-105602-244471
- Status: COMPLETED
- Finding: Edit event kalender: eventsblocks tidak map attendees (c_partmails newline) & classification (c_classification 0/1/2) -> edit+simpan MENGHAPUS peserta & reset klasifikasi jadi public. Fix: fetchCalendarEventDetail GET /Calendar/{id}/view (field iCal lengkap: summary/location/comment/classification/attendees array {email,name,partstat,role}, startDate/endDate ISO string, isAllDay) -> attendees array jadi string 'email, email'; date pakai Date.parse. buildAppointmentBody normalisasi classification (angka 1/2 -> private/confidential, string divalidasi). CalendarPage openEditModal async fetch+merge {...ev,...detail} + spinner editingId. EventModal handleSave sertakan classification asli. eventsblocks juga di-map attendees+classification sbg fallback anti-wipe.

## 2026-08-20T11:01:37Z
- Task: 20260820-110117-165829
- Status: COMPLETED
- Finding: Recurring event SOGo: payload `repeat` kontrak iCalRepeatableEntityObject+SOGo.m — {frequency, interval, [count], [until], [days], [monthdays], [months], [dates]}. frequency lowercase daily/weekly/monthly/yearly + spesial bi-weekly (->weekly interval 2), every weekday, custom. EventModal: UI freq+interval+end(never/count/until); prefill dari event.repeat (/view); pola kustom dipertahankan via originalRepeatRef (anti data-loss bila user cuma edit judul); repeatTouchedRef menandai apakah kontrol diubah. buildAppointmentBody sertakan repeat; fetchCalendarEventDetail return repeat: d.repeat.

## 2026-08-20T11:05:26Z
- Task: 20260820-110511-162155
- Status: COMPLETED
- Finding: Event berulang SOGo: kolom DB c_iscycle (0/1, dari iCalEvent+SOGo.m quickRecordFromContent) menandai event recurrent. Dipetakan ke isRecurring di fetchCalendarEvents untuk ikon ulang di grid kalender. Ikon lucide-react Repeat.

## 2026-08-20T11:12:56Z
- Task: 20260820-111241-959627
- Status: COMPLETED
- Finding: SOGo recurrence: repeat.days adalah array [{day:'MO'}...] (2-huruf BYDAY MO..SU), dikonsumsi iCalByDayMask byDayMaskWithDaysAndOccurrences:o di iCalRepeatableEntityObject+SOGo.m setAttributes:. 'hari kerja saja' = weekly + days [MO..FR]. EventModal kini punya day-picker mingguan; dayCodeFromDate parse YYYY-MM-DD manual agar tak meleset di timezone belakang UTC.

## 2026-08-20T11:44:30Z
- Task: 20260820-114411-136241
- Status: COMPLETED
- Finding: SOGo /view membalas daftar UID lengkap (data.uids) tapi hanya mem-prefetch ~100 header (headersPrefetchMaxSize=100). Header sisanya diambil via POST /Mail/0/{folder}/headers body {uids:[...]} yang membalas ARRAY BARE [columnNames, ...rows] (bukan {headers:[...]}), dalam urutan IMAP (tidak sesuai urutan request) — jadi wajib di-sort ulang by uid desc di client sebelum reveal. Endpoint /headers menolak uids kosong dgn 404 {message:'No UID specified'}. getMessageTotal pakai data.uids.length. auto-load kotak masuk sekarang server-side (lewat 100) dgn batas 5 bulan via stopFetchingRef.

## 2026-08-20T12:51:05Z
- Task: 20260820-125059-377940
- Status: COMPLETED
- Finding: Indikator auto-load yang informatif: header pill menampilkan 'loaded / total' saat messages.length < totalMessageCount, dengan spinner mini ketika loadingMore. Sentinel bawah list menampilkan 'Memuat N email…' (N = Math.min(PAGE_SIZE, remainingUids.length)) ketika loadingMore, dan 'Scroll untuk memuat lagi…' saat hasMore tapi tidak ada fetch aktif. Math.min(PAGE_SIZE, remainingUids.length) = jumlah email dalam batch yang sedang di-fetch (maks 50, atau sisa bila kurang).

## 2026-08-20T12:53:40Z
- Task: 20260820-125333-305684
- Status: COMPLETED
- Finding: Auto-load server-side (MailPage.jsx via IntersectionObserver + /headers) memang universal untuk SEMUA folder (folderINBOX/folderSent/folderJunk/folderDrafts/folderTrash). Pengecekan 'selectedFolder === folderINBOX' hanya 4 lokasi: notifikasi email baru (INBOX saja), batas 5 bulan stopFetchingRef (INBOX saja — penghematan memori), tombol snooze per-baris (INBOX saja), dan beda copy footer (bukan gate). loadMore + sentinel + header pill + count indicator tidak punya pengecualian folder. fetchMessageHeaders sudah diuji utk 5 folder (test:message-api) — semuanya testify POST /Mail/0/{folder}/headers body {uids:[...]}.

## 2026-08-20T12:57:04Z
- Task: 20260820-125654-156816
- Status: COMPLETED
- Finding: sendMessage di src/lib/api.js sebelumnya melempar Error mentah pada 401 /api/send sehingga _onSessionExpired tidak terpanggil — user tetap logged-in tapi tidak bisa kirim email (SMTP proxy session sudah berakhir di server). Fix: kedua branch /api/send (path utama dgn lampiran + fallback setelah SOGo-501) sekarang memanggil throwIfAuthError(res) untuk 401, sehingga App.jsx logout paksa + navigate /login. 403 TIDAK logout (From-mismatch). TTL cookie + server tetap 8 jam (SESSION_MAX_AGE_MS=480min, Max-Age=28800); idle 30 min (SESSION_IDLE_MS env SMTP_SESSION_IDLE_MIN). Test: scripts/test-smtp-session-expired.mjs — memanggil callback=1 utk sendMessage 401 dgn lampiran, callback=0 utk registerSmtpSession 401 (saat login, _onSessionExpired null).

## 2026-08-20T13:14:38Z
- Task: 20260820-131428-282178
- Status: COMPLETED
- Finding: Server endpoint baru GET /api/auth/smtp/status dengan rate-limit 30/menit mengembalikan {user, createdAt, lastUsed, maxAgeMs, idleMs, remainingMs} dimana remainingMs = min(SESSION_MAX_AGE_MS - (now - createdAt), SESSION_IDLE_MS - (now - lastUsed)). requireSmtpSession middleware dipakaI jadi 401 = sesi berakhir otomatis picu logout via throwIfAuthError di fetchSmtpSessionStatus(). Client Sidebar poll tiap 60s + tick lokal 1s; tampil badge 'SMTP MM:SS' saat < 15 menit (show below SHOW_BELOW_MINUTES=15). Palette: muted ≤15m, amber ≤5m, destructive+animate-pulse ≤1m. Helper pure di src/lib/sessionCountdown.js: formatRemaining(ms) → 'M:SS' atau 'H:MM:SS', sessionWarningLevel(ms) → 'ok'|'warn'|'urgent'. Test test:session-countdown.

## 2026-08-20T13:18:22Z
- Task: 20260820-131813-225244
- Status: COMPLETED
- Finding: Idle timeout SMTP proxy dapat diatur via env SMTP_SESSION_IDLE_MIN (default 30 menit di server.js). Dipakai runtime via EnvironmentFile=%h/sogo-proxy/.env — BUKAN inline Environment= di .service unit yang ada di server (yang sebenarnya hanya berisi WorkingDirectory/ExecStart/Restart/EnvironmentFile). Untuk mengubah runtime value, edit .env di server, lalu systemctl --user restart sogo-smtp-proxy. TTL absolut terpisah (SMTP_SESSION_TTL_MIN=480=8jam) jadi 'tetap aman'. Memory map dibatasi SESSION_MAX_PER_USER=10 (LRU eviction). Idle 60 menit menambah window risiko hijack ~30 menit, masih wajar & industri-bandingkan.

## 2026-08-20T13:27:52Z
- Task: 20260820-132742-138659
- Status: COMPLETED
- Finding: deploy.sh tambah helper ensure_runtime_env() yg idempotent utk key=value di server .env. Dipanggil di awal deploy_backend — bekerja walaupun server.js unchanged (no restart kalau tak ada code change). Pola ssh: awk utk baca nilai / printf+tambah utk append / sed+.bak+printf utk replace. EXPECTED_SMTP_SESSION_IDLE_MIN=60 di top of file (override via env). Test: scripts/test-deploy-runtime-env.sh — 5 skenario bash (mock ssh via tmp dir). 17/17 test PASS.

## 2026-08-20T13:31:36Z
- Task: 20260820-133121-262175
- Status: COMPLETED
- Finding: SmtpHeartbeat: ping /api/auth/smtp/status setiap 50 menit (SMTP_HEARTBEAT_INTERVAL_MS = 50*60*1000) HANYA saat document.visibilityState === 'visible'. Saat hidden → clearInterval. Resume→visible: immediate ping (catch-up). Helper pure setupSmtpHeartbeat({schedule, isVisible, setInterval, clearInterval}) - testable dgn mocked timers. Sidebar refetchInterval juga visibility-aware (return false saat hidden) supaya lastUsed TIDAK di-refresh via polling countdown. lastUsed di server di-refresh via requireSmtpSession middleware setiap call ke /api/send atau /api/auth/smtp/status. 401 dari ping → throwIfAuthError → App.jsx auto-logout (sama dgn /api/send).

## 2026-08-20T13:35:46Z
- Task: 20260820-133521-293553
- Status: COMPLETED
- Finding: scripts/monitor-smtp.sh: probe /api/health (via SSH) + hitung rasio [smtp-session] 401 send / Registered for dlm journalctl window. Exit 0 OK, 1 unhealthy, 2 ratio > CRIT. JSON output utk alerting. Server.js tambah log '401 send: sesi tidak valid (ip=X)' di /api/send 401 — penting krn sebelumnya log tdk punya pola 401 capture. Cron: '*/15 * * * * ./scripts/monitor-smtp.sh --json > /var/log/smtp-monitor.json 2>&1'. Naikkan idle jika ratio > 0.20: EXPECTED_SMTP_SESSION_IDLE_MIN=90 ./deploy.sh + restart sogo-smtp-proxy (deploy.sh ensure_runtime_env idempotent).

## 2026-08-20T13:40:24Z
- Task: 20260820-134013-202650
- Status: COMPLETED
- Finding: Favicon SVG envelope: viewBox 0 0 64 64, bg #3b82f6 (Tailwind blue-500, default primary), envelope putih outline + V-flap. Path: public/favicon.svg → dist/favicon.svg via Vite. index.html: <link rel=icon type=image/svg+xml href=/webmail/favicon.svg> + <link rel=apple-touch-icon href=/webmail/favicon.svg> + <meta name=theme-color content=#3b82f6>. SVG 582 bytes; modern browser support tanpa ICO fallback.

## 2026-08-21 — Crash Settings: data legacy localStorage tanpa guard

- **Gejala:** /webmail/settings → "Terjadi Kesalahan" (ErrorBoundary root). Penyebab: `sig.html.length` di SignatureSection saat entri signature legacy (`pcp_signatures_<email>`) tidak punya field `html` → TypeError. Data lama dari versi pra-multi-signature berbentuk `{ id, name }`.
- **Pola bug yang berulang:** akses field objek dari localStorage tanpa validasi bentuk → crash render. Pelajaran: (1) render path yang membaca data user (localStorage/API) HARUS pakai optional chaining; (2) normalisasi data di SOURCE (loadSignatures) lebih kuat daripada guard di tiap consumer; (3) ErrorBoundary root menyembunyikan detail error → debugging butuh repro yang meniru data user.
- **Cara reproduce crash produksi tanpa browser:** jsdom + bundle produksi nyata (dist/). Kunci setup: seed zustand persist `pcp-auth` (state+version 0), stub fetch balas 200 JSON agar sesi tidak di-logout (401 → auto-logout via throwIfAuthError), install global SVGElement/SVGSVGElement/SVG* (jsdom tidak mendefinisikannya sebagai global Node), lalu baca `localStorage.pcp_last_error` yang ditulis ErrorBoundary. Lihat `scripts/test-settings-signature.mjs`.
- **Deploy bundle == HEAD?** Cara verifikasi cepat: normalize nama chunk (api-X.js, index-X.js, dst) lalu bandingkan byte. Deployed PreferencesPage == HEAD persis; api chunk hanya beda `VITE_SOGO_BASE_URL` (deploy override `VITE_SOGO_BASE_URL=""` → same-origin, benar utk domain .com; build lokal membaca .env → .co.id).
- **VITE_API_KEY di-bake ke bundle saat build** (deploy.sh baca dari .env server) → semua chunk hash berubah antar build meski source sama (cascade nama chunk di import statement). Jangan simpulkan "deployed berbeda" dari perbedaan hash saja.

## 2026-08-21T09:29:56Z
- Task: 20260821-settings-crash-fix
- Status: COMPLETED
- Finding: Settings crash root cause terkonfirmasi: sig.html.length pada entri signature legacy (tanpa field html) di localStorage -> TypeError -> ErrorBoundary root. Fix: guard optional chaining + normalisasi entri di loadSignatures + SectionErrorBoundary per-tab. Repro jsdom end-to-end (test-settings-signature.mjs) + unit test legacy. Teknik verifikasi: deployed chunk == HEAD via normalisasi nama chunk; VITE_API_KEY di-bake saat build membuat semua hash chunk berubah.

## 2026-08-21 — Pola normalisasi data storage (loadSignatures pattern)

- **Pola bug yang berulang:** setiap modul storage (signatures, autoArchive, snooze, prefs cache, flagColors) membaca `JSON.parse(localStorage.getItem(...))` lalu mengoper MENTAH ke konsumen render → field akses pada bentuk data lama/rusak → TypeError.
- **Pola fix wajib:** normalisasi di SOURCE READER (bukan guard di tiap konsumen): filter entri valid, coerce field ke tipe yang dijanjikan (string/number/boolean/array), bentuk rusak → bentuk kosong valid. Contoh lengkap: `getRules` di autoArchive.js.
- **Jebakan koersi JS:** `Number(null)=0`, `Number(true)=1`, `Number('')=0` — koersi dari data rusak menghasilkan nilai "valid" yang salah. Kalau mau menolak, cek tipe asli: `typeof wake === 'number' || typeof wake === 'string'`.
- **Daftar modul yang SUDAH dinormalisasi (2026-08-21):** signatures (loadSignatures), autoArchive (getRules), api.js (loadPrefsFromLocal, fetchContacts), snooze (loadSnoozes), mailboxTree (flattenMailboxes), flagColors (getStore). Parser API lain sudah aman: parseMessageRows, fetchCalendarEvents.
- **Tiap modul storage baru WAJIB** menyertakan unit test data legacy (contoh: test-autoarchive.mjs, test-snooze.mjs).

## 2026-08-21T09:38:37Z
- Task: 20260821-data-normalization-audit
- Status: COMPLETED
- Finding: Audit normalisasi data storage selesai: getRules (autoArchive), loadPrefsFromLocal + fetchContacts (api.js), loadSnoozes (snooze.js), flattenMailboxes (mailboxTree.js), getStore (flagColors) kini menormalkan data legacy di source reader (pola loadSignatures). Jebakan: Number(null)=0, Number(true)=1. Test baru test:autoarchive + perluasan test:snooze/mailbox-tree/preferences-fallback. 36/36 PASS.

## 2026-08-21 — Unit test komponen JSX tanpa test runner (esbuild + jsdom)

- Node tidak bisa import .jsx langsung. Teknik: esbuild.build({ stdin: harness yang import komponen + definisikan child yang throw, bundle: true, write: false, format:'esm', jsx:'automatic' }) → import hasil via `data:text/javascript;base64,...` → jalankan di jsdom (createRoot). Contoh: scripts/test-error-boundary-debug.mjs.
- **Penting:** redam console.error selama render (React + ErrorBoundary mencetak stack yang bisa berisi base64 source harness → banjir output & pipe putus).
- ErrorBoundary root menyimpan error ke localStorage 'pcp_last_error' (console + storage) — detail TIDAK ditampilkan default; sejak 2026-08-21 ada tombol opt-in "Lihat Detail Error" utk pemilik akun (keputusan keamanan tetap: hidden by default, reset saat error baru).

## 2026-08-21T09:43:41Z
- Task: 20260821-error-boundary-debug-button
- Status: COMPLETED
- Finding: Tombol debug di ErrorBoundary root: detail error (pesan+stack+componentStack) tampil opt-in via toggle, default hidden (keputusan keamanan dipertahankan), reset saat error baru. Teknik unit test komponen JSX tanpa test runner: esbuild stdin bundle + data URL import + jsdom; redam console.error saat render. esbuild devDep. 37/37 PASS.

## 2026-08-21 — Migrasi sekali-jalan data legacy: pola write-back idempotent

- Pola migrasi aman di reader: deteksi bentuk lama (mis. `typeof e.html !== 'string'`) → hasil baru + flag penanda → **tulis balik ke localStorage** → baca berikutnya tidak mengubah apa pun (idempotent). Flag penanda (mis. `placeholder:true`) dipakai consumer utk menunda efek samping (injeksi) sampai user mengisi.
- **Aman untuk email:** placeholder signature TIDAK boleh ikut terkirim — konsumen injeksi harus skip entri ber-flag (`localSig?.html && !localSig?.placeholder`), dan flag dihapus saat user menyimpan konten nyata (updateSignature).
- Sebelum menyimpulkan "banyak konsumen", verifikasi sumber saat ini: grep getSignatureFor → hanya ComposeModal (MessageReader sudah tidak memakainya meski sejarah kode menunjukkan pernah).

## 2026-08-21T09:48:19Z
- Task: 20260821-signature-legacy-placeholder
- Status: COMPLETED
- Finding: Migrasi sekali-jalan signature legacy: placeholder + flag + write-back idempotent di loadSignatures; konsumen injeksi (ComposeModal, syncToSogo) skip placeholder agar tidak terkirim; updateSignature hapus flag saat user isi. Badge 'Perlu diisi' di daftar. 37/37 PASS.

## 2026-08-21 — Rollout pola write-back idempotent (lengkap)

- Semua modul storage kini memakai pola yang sama: baca → normalisasi bentuk → **tulis balik HANYA bila berubah** (bandingkan JSON.stringify utk list kecil, atau flag `changed` di loop) → baca berikutnya no-op. Daftar lengkap: signatures (placeholder), autoArchive getRules, snooze loadSnoozes, flagColors getStore, api.js loadPrefsFromLocal, userPrefs loadPrefs.
- **Pengecualian yang disengaja:** userPrefs.loadPrefs mengembalikan null utk bentuk array/non-object TANPA menulis (kontrak null = "belum ada preferensi" — sama seperti fetchPreferences fallback layer 2). Modul lain (snooze/flagColors/getRules) membersihkan bentuk rusak jadi bentuk kosong valid. Pilih sesuai semantik konsumen.
- **Biaya:** JSON.stringify compare per baca hanya utk struktur kecil (rules, prefs). Hindari pola ini di hot-path per-bar (mis. isSnoozed per baris — pakai flag `changed`, bukan stringify).

## 2026-08-21T10:02:31Z
- Task: 20260821-storage-writeback-rollout
- Status: COMPLETED
- Finding: Rollout pola write-back idempotent ke semua modul storage: snooze, flagColors (prune warna), autoArchive getRules, loadPrefsFromLocal (api.js), userPrefs. Tulis balik hanya saat bentuk berubah (JSON.stringify compare / flag changed). Pengecualian: userPrefs null tanpa tulis utk non-object. 38/38 PASS.

## 2026-08-21 — Titik injeksi signature yang harus skip placeholder (daftar final)

- Auto-inject compose/reply: `ComposeModal` `getSignatureFor(...)` → `(html && !placeholder) || SOGoFallback`.
- Manual insert: `ComposeModal` `SignaturePicker` → filter `!s.placeholder` (jangan tampilkan).
- Sinkronisasi SOGo: `PreferencesPage.syncToSogo` → `(html && !placeholder) ? html : ''`.
- Daftar Settings: badge "Perlu diisi — klik untuk mengedit".
- **Pelajaran:** setiap fitur yang menulis/menyisipkan konten user ke email harus mengecek flag data legacy — grep getSignatureFor/loadSignatures sebelum deploy fitur baru.

## 2026-08-21T10:05:53Z
- Task: 20260821-signature-consumer-audit
- Status: COMPLETED
- Finding: Audit konsumen signature selesai: hanya PreferencesPage + ComposeModal. SignaturePicker di-skip placeholder agar tidak ter-insert; dead import dihapus. Kontrak getSignatureFor placeholder di-test. 38/38 PASS.

## 2026-08-21 — Helper storageMigrate.js (pola resmi migrasi storage)

- **Pola resmi sejak sekarang:** semua baca/tulis storage pakai `src/lib/storageMigrate.js`: `readJSON(key)` → null utk missing/parse-error; `writeJSON(key, v)` utk tulis yang sudah diputuskan; `writeIfChanged(key, original, normalized)` utk tulis hanya-saat-berubah (idempotent).
- **PENTING — semantik readJSON:** JSON literal `'null'` tersimpan = "tidak ada data" (null), BUKAN bentuk rusak — tidak ditulis ulang. Bentuk rusak yang dimigrasi hanya yang bisa di-parse tapi salah bentuk (array/string/object dengan field salah).
- Modul baru yang menyimpan data user di localStorage WAJIB memakai helper ini + menyertakan unit test data legacy.

## 2026-08-21T10:10:41Z
- Task: 20260821-storage-migrate-helper
- Status: COMPLETED
- Finding: Helper bersama src/lib/storageMigrate.js (readJSON/writeJSON/writeIfChanged) merangkum pola write-back idempotent; 6 modul storage direfactor. Semantik: JSON 'null' = tidak ada data (tidak ditulis ulang). 39/39 PASS.

## Storage schema versioning (localStorage pcp_*_v2)

- Pola: setiap domain storage memakai base key ber-version
  `pcp_<domain>_v2_<scope>` (v1 legacy tanpa `_v2`). Migrasi skema berikutnya
  cukup menaikkan `STORAGE_VERSION` di `src/lib/storageMigrate.js` + tambah
  normalisasi di pemakai — data lama otomatis dibaca dari key lama via
  fallback chain `readStorage()` dan dipindah ke key terbaru sekali-jalan
  (`persistNormalized`), lalu key lama dihapus (hanya bila tulis sukses).
- Key v1 TIDAK dihapus bila tulis ke v2 gagal (quota) — migrasi bisa dicoba
  lagi di baca berikutnya.
- JSON literal `'null'` tersimpan dianggap "tidak ada data" (readJSON → null);
  readStorage menganggap v2 ber-`'null'` = tidak ada → fallback ke v1.
- 6 domain sudah v2: pcp_signatures, pcp_snooze, flag_colors,
  auto_archive_rules, sogo_prefs (cache prefs), pcp_prefs.
- `clearAllRules` harus membersihkan key v2 + v1 agar benar-benar reset.

## 2026-08-21T10:18:53Z
- Task: 
- Status: COMPLETED
- Finding: Storage schema versioning: semua domain localStorage (pcp_signatures, pcp_snooze, flag_colors, auto_archive_rules, sogo_prefs, pcp_prefs) dimigrasi ke key *_v2_* dengan fallback chain readStorage() + persistNormalized() di storageMigrate.js; key v1 dihapus hanya bila tulis v2 sukses; JSON literal 'null' dianggap tidak ada data. 39/39 test PASS, build OK.

## 2026-08-21T10:24:14Z
- Task: 
- Status: COMPLETED
- Finding: Sanitasi kirim email: sendMessage() di api.js kini selalu DOMPurify.sanitize(body, PURIFY_CONFIG) utk isHTML sebelum dikirim (SMTP langsung, payload SOGo /send, fallback SMTP 501) — defense-in-depth di atas sanitasi ComposeModal.handleSend; guard DOMPurify.isSupported utk lingkungan tanpa DOM; test jsdom test-send-sanitize memverifikasi script/onerror/javascript:/data: href hilang + rel=noopener dipaksa + plain text tidak diubah. 40/40 test PASS.

## 2026-08-25 — Bug hunt menyeluruh: 6 temuan durable (flow/UX/security)

- **formatAddresses HARUS normalisasi item array SOGo:** SOGo kadang kirim `from`/`to` sebagai array berisi string mentah ATAU null (bukan selalu `{name,email}`). `arr.map(a => a.name ? ... : a.email)` crash TypeError saat item null dan menghasilkan string kosong/`undefined` untuk item string. Fix pola: `!a → skip`, `typeof a === 'string' → a`, objek → `Nama <email>`, fallback `String(a)`. Lokasi: `src/lib/format.js` (dipakai MessageReader).
- **Dua keydown listener global = double-fire:** MailPage (daftar) dan MessageReader (reader) dua-duanya menambah `window.addEventListener('keydown')` dan keduanya aktif saat reader terbuka. Shortcut per-pesan (`s` star, `r` balas, `f` teruskan) harus di-ownership SATU pihak: `isReaderOwnedShortcut(selectedMsgId, key)` di `src/lib/constants.js`. Bonus: guard listener juga harus cek `e.target.contentEditable === 'true'` — RichEditor compose adalah DIV contentEditable, bukan INPUT/TEXTAREA, jadi shortcut global tetap jalan saat user mengetik email (bisa hapus pesan yang sedang dibaca!).
- **Drag & drop kalender = update parsial:** `handleDrop` lama membangun payload baru tanpa `attendees`/`repeat` → drag event menghilangkan peserta & recurrence diam-diam. Pola: pemindahan (move) HARUS mempertahankan seluruh field event; jangan rebuild payload dari nol. Ekstrak ke pure function `buildDroppedEventData` (`src/lib/calendarDrop.js`) agar ter-test.
- **Log produksi tidak boleh memuat session token:** `console.warn('[Login] warm-up shell →', ..., url.split('/').pop())` menulis sogoToken (session token) ke console browser di produksi. Semua log di `api.js` yang memuat data sensitif harus `debugLog`/`debugWarn` (DEV-only) — konsisten dgn keputusan log DEV-only.
- **Panel detail `hidden md:block` = fitur mati di mobile:** ContactsPage panel detail kontak `hidden md:block` → di layar < md, tap kontak tidak menampilkan apa-apa (state berubah tapi tidak dirender). Pola: setiap panel detail desktop butuh pasangan sheet mobile (overlay fixed + backdrop).

## 2026-08-25T15:49:02Z
- Task: 
- Status: COMPLETED
- Finding: formatAddresses harus normalisasi item SOGo (null/string); dua keydown global = double-fire → ownership satu pihak via isReaderOwnedShortcut; drag kalender harus pertahankan seluruh field event; log produksi tidak boleh memuat session token; panel detail hidden md:block = fitur mati di mobile.

## 2026-08-26T01:07:44Z
- Task: 
- Status: COMPLETED
- Finding: Audit aksesibilitas webmail: token kontras light muted-foreground 45% (4.64:1 on muted), destructive light 0 72% 46% (5.61) / dark 0 84% 58% (5.04); amber-900 session badge; star amber-600 light + amber-400 dark (3.15/13.07); spam orange-600 light (3.58); SwipeableRow butuh dark:bg-red-700 krn destructive dark 58% lightness memberi white-fg cuma 3.79:1. Touch target 44px via min-w-11/min-h-11 di toolbar/bulk/reader/sidebar. Aria: semua icon-only button butuh aria-label; toggle pakai aria-pressed; filter/move pakai aria-expanded; sender baris pesan <span onClick> → <button type=button> agar keyboard-accessible. focus-visible global outline hsl(var(--ring)) di index.css. Known limits: --border light 1.23:1 (3:1 butuh border ~75% lightness, perubahan visual besar), FLAG_COLORS yellow-500/green-500 <3:1 di light (perlu varian 600/700). Test a11y = 63 assertions (18 kontras matematis + 45 static).

## 2026-08-26T01:15:42Z
- Task: 
- Status: COMPLETED
- Finding: Bug hunt kombinasi: (1) SEMUA query key React Query global harus di-scope identitas user — ['smtp-session-status'] di Sidebar tanpa scope menampilkan countdown sesi akun sebelumnya ke akun baru (cache QueryClient global, staleTime 30s). Fix: queryKey ['smtp-session-status', user?.sogoToken]. (2) Komponen yang mount permanen di belakang modal (MessageReader + ComposeModal saat reply) perlu guard keyboard berdasarkan state modal: prop shortcutsEnabled={!composeOpen} + guard di handler + deps array. Tanpa ini 'r' reset compose, Delete hapus pesan yang dibalas, Escape tutup reader di balik modal. (3) Verified aman multi-akun: localStorage semua *_v2_<email> scoped; LoginPage revokeSmtpSession+clearUser+resetSessionExpiredFlag sebelum login baru; server /api/send terikat session.user + anti-spoof From (403 bila mismatch); register SMTP evict sesi lama per user; visibleOrderUids = hasil filter snooze (reader tak buka pesan tersembunyi); semua interval unmount-clean + multi-tab idempotent. Test test:state-combination = 7 assertions static.

## 2026-08-26T01:35:07Z
- Task: 
- Status: COMPLETED
- Finding: Edge case kalender: EventModal TIDAK validasi end>=start — SOGo menerima payload durasi negatif dan bikin event rusak/500; fix helper murni src/lib/eventValidation.js (validateEventTimes: all-day start==end valid, lintas tanggal valid, tanggal rusak ditolak tanpa crash) + normalizeRepeatCount (0/negatif/NaN→1, float floor) dipakai handleSave. Verified aman: pagination MailPage dedup by uid + sort desc + cutoff 5-bulan via uid MINIMUM batch (headers tak urut) + stopFetchingRef utk batch pendek; visibleCount sengaja tak di-reset (jaga scroll). StatsPage semua count default 0 via catch. ContactsPage key uid||idx. RulesPage StatsBar guard total==0. ComposeModal guard to wajib + server validateRecipientList (emailValidation.js) 400. Test test:event-validation = 16 assertions.

## 2026-08-26T01:39:42Z
- Task: 
- Status: COMPLETED
- Finding: Validasi recipient compose: ComposeModal hanya guard to wajib, format invalid lolos sampai server (400 generik). Fix: firstInvalidRecipient(value) di src/lib/emailValidation.js — entri pertama tidak valid dlm daftar dipisah koma (null bila valid), reuse isSafeRecipient (anti CRLF/header injection, support 'Nama <email>'); guard handleSend validasi Kepada/Cc/Bcc berurutan dgn pesan 'Alamat email tidak valid di "<field>": "<addr>". Gunakan format nama@domain.com.'; koma/spasi trailing diterima (filter Boolean); server tetap validasi ulang (validateRecipientList) — defense-in-depth dua lapis.

## 2026-08-26T01:43:52Z
- Task: 
- Status: COMPLETED
- Finding: Duplikat event kalender: (1) EventModal double-submit — tombol disabled={saving} (state async) TIDAK melindungi Enter auto-repeat/klik ganda di tick yang sama; handleSave/handleDelete butuh guard re-entry via useRef sinkron (savingRef), bukan state, karena 2x createCalendarEvent = 2x newEventGuid = 2 event. (2) SOGo eventsblocks meng-expand recurring jadi satu baris PER OCCURRENCE (start berbeda) — JANGAN dedup by id saja; dedup benar by id|start|calendar (normalisasi String utk number vs string), recurring & cross-calendar tetap dipertahankan. Parser dipindah ke src/lib/calendarEvents.js (murni, bisa diuji) + guard baris rusak (blocks/baris non-array) agar satu baris korup tidak merusak kalender. Test test:calendar-events = 18 assertions.

## 2026-08-26T01:49:00Z
- Task: 
- Status: COMPLETED
- Finding: Security refresh: (1) rate-limit /api/send harus per-AKUN bukan per-IP — kantor/NAT berbagi 1 IP publik, key IP = 10 kirim/mnt tersedot semua user (429 palsu). Pola: middleware resolveSmtpSession (isi req.smtpSession tanpa 401) sebelum rateLimit, keyFn (req)=>req.smtpSession?.user||clientIp(req); handler reuse req.smtpSession; JANGAN hapus log '[smtp-session] 401 send' (monitor-smtp.sh grep '401 send'). (2) Query pencarian ke SOGo wajib di-cap (MAX_SEARCH_QUERY_LENGTH=500 di buildMessageSearchBody + maxLength input) — body /view tanpa batas = DoS ringan ke SOGo. Pola tetap kuat: clientIp hanya percaya X-Real-IP dari trusted proxy; pathSegment anti-traversal (hanya %2F utk folder); attachment filename anti-path/CRLF; toSafeUrl allowlist; /api/preferences bind session.user (403 mismatch); API key timing-safe; cookie httpOnly SameSite=Strict.

## 2026-08-26T01:57:43Z
- Task: 
- Status: COMPLETED
- Finding: Edge kontak & signature: (1) highlight seleksi kontak 'selected?.uid===contact.uid' crash-logika saat uid kosong (entri GAL/rusak) — SEMUA baris kosong-uid ke-highlight; pola aman: contact.uid ? uid===selected.uid : contact===selected. (2) Duplikat kontak: blokir duplikat PERSONAL (pesan jelas), IZINKAN duplikat GAL (direktori read-only, salinan personal dari kolega = normal) — findDuplicateKind prioritas personal > gal, case-insensitive. (3) Sync signature SOGo one-way push → perangkat lain stale selamanya (fallback SOGo hanya saat daftar lokal KOSONG); fix pull-back idempotent: shouldImportSogoSignature(list, html) = sogoHtml non-empty && tidak ada entri dgn html trim sama — tarik sebagai entri baru saat buka Settings; tidak menimpa editan lokal, tidak menumpuk. Test test:contact-signature-edge = 18 assertions.

## 2026-08-26T02:01:52Z
- Task: 
- Status: COMPLETED
- Finding: Nginx webmail security: HSTS wajib tanpa includeSubDomains (subdomain lain bisa non-HTTPS); COOP same-origin + CORP same-origin + X-XSS-Protection 0 + CSP upgrade-insecure-requests ditambahkan ke 3 blok location. Keputusan penting: img-src 'self' data: TANPA https: — semua gambar eksternal email di-rewrite ke /api/image-proxy (anti tracking-pixel); mengizinkan https: langsung = browser bisa muat pixel tanpa proxy. Referrer-Policy strict-origin-when-cross-origin krusial krn URL SOGo memuat sogoToken di path (hanya origin yg bocor keluar). /api/* proxy tidak perlu header tambahan — server.js upstream sudah set sendiri. Image-proxy 502 utk URL gambar gagal = status sengaja remoteImage.js (DNS/redirect/UA), bukan regresi nginx; 400 passthrough utk url invalid bukti routing jalan. Config single-source: configs/site.webmail.custom + deploy.sh substitusi port + reload; validasi docker exec nginx -t dulu sebelum reload.

## 2026-08-26T02:04:33Z
- Task: 
- Status: COMPLETED
- Finding: /api/health butuh API key — di-enforce di server.js app.use('/api', requireApiKey) SEBELUM route (bukan di nginx; nginx passthrough). Preflight deploy.sh cek dgn key ke backend langsung; verify() tidak cek health → gap. Fix: verify_health() end-to-end via nginx (--resolve 127.0.0.1) + key dari .env via awk heredoc (pola sama preflight, anti-escaping); harap 200. Keputusan: health tetap di belakang key (konsisten semua /api/*, hanya {ok:true}). CATATAN arsitektur: VITE_API_KEY ada di bundle frontend = soft gate; auth sebenarnya /api/send dll = cookie SMTP httpOnly SameSite=Strict; jangan andalkan API key sbg satu-satunya auth.

## 2026-08-26T02:06:03Z
- Task: 
- Status: COMPLETED
- Finding: verify_health ditambahkan ke deploy.sh verify() — cek /api/health end-to-end via nginx + API key (sebelumnya hanya preflight backend langsung). /api/health di-enforce requireApiKey di server.js (app level), nginx passthrough; konsisten dgn preflight. Deploy terverifikasi live: webmail 200, image-proxy 200, health 200.

## 2026-08-26 — Snooze harus folder-scoped + rules skip pesan snooze

- **UID SOGo adalah PER-FOLDER:** pesan yang dipindah (arsip/move/junk) mendapat
  UID BARU di folder tujuan. Storage client yang keyed by uid (snooze, flag
  colors) WAJIB folder-scoped bila pesan bisa pindah folder — schema flat
  `{uid: wake}` membuat entri yatim yang bisa salah sembunyikan pesan inbox
  baru yang memakai ulang UID lama.
- **Pola migrasi versi per-domain:** `readStorage(baseKey, scope, maxVersion)`
  menerima argumen versi — gunakan `readStorage(BASE_KEY, email, 3)` utk domain
  tertentu TANPA menaikkan `STORAGE_VERSION` global (yang akan mengubah key
  SEMUA domain lain).
- **Snooze = deferral eksplisit → auto-archive rules HARUS SKIP pesan snooze**
  (`executeRules` terima `isExcluded(msg)`). Rules di-proses ulang saat wake
  (rulesProcessed di-reset per ganti folder).
- **Pembersihan entri yatim:** hapus snooze utk uids yang dipindah di onSuccess
  mutation (move/delete/junk/archive) + bump tick/memo agar UI langsung
  ter-refresh (jangan nunggu interval prune 60s).

## 2026-08-26T02:16:57Z
- Task: 
- Status: COMPLETED
- Finding: Snooze di-migrasi ke schema v3 folder-scoped {[folderId]:{[uid]:wake}} — UID SOGo per-folder membuat entri snooze flat (v2) yatim saat pesan di-archive (false-positive sembunyikan pesan baru dgn UID reuse). executeRules terima isExcluded(msg) utk skip pesan tersnooze (deferral eksplisit user). unsnoozeMessages membersihkan entri saat move/delete/junk/archive + bump tick. Migrasi versi per-domain via readStorage(base, scope, 3) tanpa ubah STORAGE_VERSION global. 49/49 test PASS, deploy live terverifikasi hash.

## 2026-08-26 — Urutan tampil = SATU sumber (date-sort); sort toggle = urutan grup

- **UID SOGo per-folder tidak dijamin sekuensial dengan waktu** — jangan
  mengurutkan daftar pesan by uid bila urutan tanggal yang diharapkan (date
  group, thread conversation). Gunakan `sortMessagesByDate` (parseMessageDate
  toleran, tiebreak uid desc, unparseable paling bawah).
- **Sort toggle (terlama dulu) sebaiknya membalik urutan GRUP, bukan baris** —
  baris dalam satu grup (hari / thread) tetap date-descending (pola Gmail).
  Flat: `reorderDateGroups`. Conversation: `groupMessages(messages, asc)`.
- **Urutan RENDER, KEYBOARD (j/k), dan RANGE-SELECT (visibleOrderUids) harus
  dari sumber yang SAMA** — kalau tidak, highlight fokus menunjuk pesan beda
  dari yang dirender, dan range-select salah memilih.
- **Fallback visibleOrderUids** wajib ada saat conversation view aktif tapi
  tidak menghasilkan grup (semua subjek unik) — kalau tidak, auto-advance
  reader & range-select mati diam-diam.

## 2026-08-26T02:23:56Z
- Task: 
- Status: COMPLETED
- Finding: Konflik sorting MailPage: sortedMessages kini urut by TANGGAL (sortMessagesByDate — uid SOGo tidak dijamin sekuensial dgn waktu). sortAsc hanya membalik urutan GRUP (reorderDateGroups utk date-group, groupMessages asc utk conversation thread), isi grup tetap date-descending. Keyboard j/k + range-select visibleOrderUids pakai sumber urutan sama dengan render; fallback saat conversation view tanpa grup. 49/49 test PASS, deploy live hash terverifikasi.

## 2026-08-26 — Koordinasi lintas tab: sessionStorage utk klaim, storage event utk sync

- **Event `storage` hanya ter-fire di tab LAIN** (bukan tab yang menulis) —
  untuk sinkronisasi UI antar tab, pasang `window.addEventListener('storage')`
  dan cocokkan `e.key` dengan key domain (jangan lupa `e.key === null` = clear).
- **Klaim/lock lintas tab = sessionStorage** (per-tab, otomatis hilang saat tab
  ditutup) + TTL eksplisit (mis. 5 menit) agar kegagalan tidak mengunci
  selamanya. `localStorage` untuk lock lintas tab berisiko meninggalkan sampah
  permanen saat tab mati mendadak.
- **Double-execution guard:** `rulesProcessed` (ref per-tab) tidak cukup untuk
  multi-tab — dua tab menjalankan engine yang sama independen. Kombinasi:
  claim (sessionStorage) + skip + release setelah sukses/gagal.
- **Notification API `tag`** — browser mengganti notifikasi dengan tag sama;
  cukup utk dedup notifikasi lintas tab (tidak perlu koordinasi manual).

## 2026-08-26T02:29:57Z
- Task: 
- Status: COMPLETED
- Finding: Race multi-tab diperbaiki: (1) snooze sync via storage event listener (key pcp_snooze_v3/v2 + clear) → bump snoozeTick — event 'storage' hanya fire di tab lain; (2) auto-archive double-move dicegah via claimAutoArchiveUids (sessionStorage per-tab, TTL 5 mnt) + releaseAutoArchiveClaims; rulesProcessed hanya utk pesan yang benar-benar dipindah; (3) notifikasi sudah dedup via Notification tag. Pelajaran: sessionStorage utk klaim lintas tab (auto-clean saat tab tutup), storage event utk sync UI. 50/50 test PASS, deploy live hash terverifikasi.

## 2026-08-26 — Sync cache React Query lintas tab: domain version bump (monotonik)

- **Cache React Query per-tab** — invalidate di satu tab tidak mempengaruhi tab
  lain. Untuk data server-side yang diubah user (kalender, kontak), gunakan
  pola: penulis `bumpDomainVersion` (localStorage `pcp_<domain>_v_<email>`),
  tab lain `watchDomainVersion` (listener storage event) → invalidate query.
- **Versi WAJIB monotonik:** `Math.max(Date.now(), prev + 1)` — dua mutasi
  dalam milidetik yang sama menghasilkan timestamp sama, dan tab lain tidak
  mendeteksi perubahan. (Bug ini ditemukan test: `test:cross-tab`.)
- Event `storage` hanya fire di tab LAIN — penulis invalidate lokal, tab lain
  invalidate via listener; tidak ada double-invalidate di tab yang sama.
- `e.key === null` = `localStorage.clear()` — perlakukan sebagai semua domain
  berubah.

## 2026-08-26T02:41:56Z
- Task: 
- Status: COMPLETED
- Finding: Sync cache React Query lintas tab utk Calendar/Contacts: helper crossTab.js — bumpDomainVersion (monotonik Math.max(Date.now(), prev+1), key pcp_<domain>_v_<email>) + watchDomainVersion (storage event listener, invalidate saat versi naik; e.key null = clear). Dipasang di CalendarPage (create/update/delete+drag) dan ContactsPage (create/delete). Bug ditemukan test: bump berbasis Date.now() bisa sama dalam ms sama → wajib monotonik. 51/51 test PASS, deploy live hash terverifikasi.

## 2026-08-26 — Hot path render bebas baca storage sinkron; gesture tekan synthetic click

- **Hot path render (per-baris × per-render) WAJIB bebas baca localStorage
  sinkron** — pola getFlagColor → getStore (read+parse+normalize seluruh store)
  per pemanggilan = jank saat scroll + hit GC. Solusi: cache in-memory per
  scope (email) + invalidate-on-write; hook/helper harus mengembalikan objek
  stabil yang di-cache, bukan membaca ulang.
- **Gesture touch yang memicu aksi (swipe/long-press) harus menekan synthetic
  click browser** yang dihasilkan setelah touchend — kalau tidak, swipe-to-
  delete sekaligus membuka pesan. Pola: callback onSwipe sebelum aksi →
  suppressClick set → onClick menelan.
- Storage yang diubah LANGSUNG (localStorage.setItem dari luar / tab lain)
  tidak terlihat oleh cache in-memory — sediakan reset eksplisit utk test dan
  terima trade-off (sama dgn perilaku pra-cache yang baca per-render).

## 2026-08-26T02:50:50Z
- Task: 
- Status: COMPLETED
- Finding: Round performance & mobile: (1) getFlagColor hot path — getStore baca+parse localStorage utk tiap baris × per-render → cache in-memory per email + invalidate-on-write + __resetFlagColorCache utk test; (2) swipe mobile membuka pesan — onSwipe callback di SwipeableRow sebelum aksi, MailPage suppressClick utk menelan synthetic click (pola long-press). Pelajaran: hot path render bebas baca storage sinkron; gesture yang memicu aksi harus tekan synthetic click. 51/51 test PASS, deploy live hash terverifikasi.

## 2026-08-26 — Angka terukur: cache flagColors hemat 58–84% waktu, 98–99% baca localStorage

- Benchmark A/B (`npm run bench:flag-cache`, modul asli + data realistis 10%
  berflag): getFlagColor beruntun utk key yang di-cache = 0 baca localStorage;
  per render-siklus baca sinkron berkurang 60–120 → 1.
- Skenario hot path MailPage: 50 baris ×2 lookup ×120 siklus = 12k panggilan
  → 8.5ms→3.2ms; 200 baris ×2 ×60 = 24k → 9.0→1.4ms. Konsisten 58–84% waktu.
- Baca localStorage di browser = sinkron di main thread + IPC + GC → biaya
  nyata lebih besar dari microbenchmark Node; kurangi SEMUA baca sinkron dari
  hot path render (per-baris × per-frame).

## 2026-08-26T02:58:08Z
- Task: 
- Status: COMPLETED
- Finding: Pengukuran dampak cache flagColors: benchmark A/B scripts/benchmark-flag-cache.mjs (npm run bench:flag-cache) memakai modul asli + data realistis. Hasil konsisten: 58-84% waktu lebih cepat & 98-99% baca localStorage berkurang (60-120 baca per siklus render → 1). Keterbatasan: CPU-side Node; verifikasi jank scroll browser butuh sesi login asli. 51/51 test PASS.

## [2026-08-26] Pola cache in-memory utk storage yang dibaca di hot path
- **Pola (dua kali terbukti — flagColors lalu autoArchive):** fungsi baca storage
  (getFlagColor / getRules / getRuleSummary) yang dipanggil per-render/per-pesan
  menyimpan cache in-memory per-email (Map). Cache miss = baca localStorage ≤2 (fallback
  chain v2+v1 via readStorage), hit = 0 baca. Invalidate di SEMUA jalur tulis modul itu
  (jangan hanya setter utama — cek lewat grep `localStorage.setItem/removeItem` di modul).
- **Trap 1 (test):** `storage.setItem` mentah di test TIDAK invalidate cache → assertion
  baca data stale. Wajib `__reset*Cache()` setelah mutasi storage langsung, atau tulis
  lewat API modul (pola yang sama di test-flag-colors & test-autoarchive).
- **Trap 2 (test):** `localStorage.clear()` juga tidak menyentuh cache in-memory — reset
  cache manual setelahnya bila test lanjut memakai data baru.
- **Detail readStorage:** 1 call = 1-2 getItem (coba versi tertinggi → fallback versi
  lama) — jadi assertion read-count pertama harus toleran (≥1 && ≤2).
- **Verifikasi jalur tulis tersembunyi:** executeRules bump runCount lewat updateRule →
  ikut invalidate. Selalu audit mutasi in-place terhadap array hasil cache (updateRule/
  toggleRule memutasi elemen cached lalu saveRules delete cache — aman).

## 2026-08-26T03:04:31Z
- Task: 
- Status: COMPLETED
- Finding: Pola cache in-memory per-email untuk storage yang dibaca di hot path (getFlagColor → getRules/getRuleSummary): cache miss = ≤2 baca localStorage (fallback v2+v1), hit = 0. Invalidate di SEMUA jalur tulis modul (audit via grep localStorage.setItem/removeItem; executeRules bump runCount lewat updateRule ikut invalidate). Trap test: storage.setItem/clear() mentah tidak invalidate cache → wajib __reset*Cache. ReadStorage 1 call = 1-2 getItem, assertion read-count pertama harus toleran.

## [2026-08-26] Pola race autosave (debounce + in-flight + send)
- **Tiga guard wajib untuk autosave compose:** (1) `autosaveBusy` ref — cegah tumpukan;
  kalau sibuk tandai dirty, biarkan finally jadwalkan ulang (bukan start baru); (2) `sentRef`
  — autosave yang sedang berjalan saat user menekan Send harus membersihkan draftnya sendiri
  (delete setelah save bila sentRef true), karena handleSend tidak bisa menunggu promise yang
  sudah lepas; (3) `userEditedRef` — autosave HANYA setelah user mengubah input; membuka
  form terisi (reply/forward/edit-draft) tidak boleh langsung membuat salinan draft baru.
- **Send handler:** `clearTimeout(timer)` + `autosaveDirty=false` sebelum request — kalau
  tidak, timer 3s bisa fire saat send in-flight → draft yatim.
- **extractHtml SOGo parts:** prefer text/html di kedalaman mana pun dari tree parts
  (findHtml dua-pass), baru fallback text/plain yang di-wrap div white-space:pre-wrap.
  Cek child langsung saja bisa memilih plain padahal html ada bersarang (multipart/mixed →
  text/plain dulu, html di dalam multipart/alternative).
- **Edit draft tanpa draftId:** SOGo draftId (session compose) tidak tersedia dari /view —
  strategi aman: buka compose pre-filled dari /view, autosave ke draft BARU, hapus draft
  asli + autosave saat kirim sukses. Duplikat dihindari oleh userEditedRef.

## 2026-08-26T03:14:25Z
- Task: 
- Status: COMPLETED
- Finding: Pola race autosave: 3 guard ref wajib — autosaveBusy (cegah tumpukan, finally reschedule), sentRef (autosave in-flight saat Send membersihkan draftnya sendiri), userEditedRef (autosave hanya setelah input user berubah). handleSend harus clearTimeout sebelum request. extractHtml SOGo parts: prefer text/html di kedalaman mana pun (findHtml dua-pass), fallback text/plain wrap div. Edit draft tanpa draftId SOGo: buka compose pre-filled dari /view + autosave ke draft baru + hapus draft asli saat kirim. Keterbatasan: draft ber-lampiran tidak bisa direstorasi (saveDraft tanpa lampiran).

## [2026-08-26] Restorasi lampiran draft SOGo
- **Pola:** downloadURL dari /view sudah memuat token sesi → cukup `fetch(downloadURL)`
  dengan `credentials: 'include'` + `sogoHeaders()` (X-XSRF-TOKEN). Konversi
  arrayBuffer → base64 harus chunked (32 KB) untuk file besar — fromCharCode dengan
  spread penuh bisa stack overflow.
- **extractAttachments:** part non-inline (bukan text/html|text/plain) yang punya
  downloadURL, termasuk bersarang (rekursif). Dipakai reader (daftar lampiran) +
  MailPage (restore draft).
- **Restore draft:** unduh paralel via Promise.allSettled — satu gagal → skip + warning,
  jangan blokir. Seed ke compose saat reset dengan id baru; restore ≠ user edit (tidak
  memicu autosave/userEditedRef).
- **Keterbatasan tersisa:** saveDraft SOGo tetap hanya teks — lampiran yang direstorasi
  hanya hidup di sesi compose (memori); begitu modal ditutup tanpa kirim, draft di folder
  tetap tanpa lampiran. Sinkronisasi penuh lampiran → draft butuh endpoint upload lampiran
  SOGo (belum dieksplorasi).

## 2026-08-26T03:21:10Z
- Task: 
- Status: COMPLETED
- Finding: Restorasi lampiran draft SOGo: downloadURL dari /view memuat token sesi — fetch + credentials include + sogoHeaders (XSRF); base64 chunked 32KB. extractAttachments di messageHtml.js (dedup reader+mail). Unduh paralel Promise.allSettled, gagal satu → skip + warning. Restore ≠ user edit (tidak memicu autosave). Keterbatasan: saveDraft SOGo hanya teks — lampiran restore hanya hidup di sesi compose.

## [2026-08-26] Pola interaksi search (MailPage)
- **Search menembus batasan daftar biasa:** window bulan (Kotak Masuk) dan filter
  snooze harus di-skip saat `searchQuery` aktif — search adalah jalan menemukan yang
  tersembunyi/lama (pola Gmail). Tapi filter yang TAMPAK di UI (flag, unread) tetap
  berlaku.
- **Rules engine harus off saat search:** effect yang memindahkan pesan (auto-archive)
  tidak boleh berjalan di atas hasil pencarian — deps + early-return `searchQuery`.
- **Filter tersembunyi = bug tersembunyi:** bila UI filter disembunyikan saat mode lain
  (tab kategori saat search), filter state-nya harus di-reset — kalau tidak hasil
  disaring secara tak terlihat tanpa cara membersihkannya.
- **Ekstraksi helper murni:** logika window yang tadinya inline di komponen
  (messagesInWindow) dipindah ke `applyMessageWindow` (dateGroups.js) — testable,
  unparseable date dianggap dalam window.

## 2026-08-26T03:26:21Z
- Task: 
- Status: COMPLETED
- Finding: Pola interaksi search: (1) search menembus batasan daftar biasa — window bulan + filter snooze di-skip saat searchQuery (pola Gmail), filter tampak tetap berlaku; (2) rules engine yang memindah pesan harus off saat search (early-return + deps); (3) filter yang UI-nya disembunyikan saat mode lain wajib di-reset state-nya (categoryFilter saat search); (4) ekstrak logika window inline ke helper murni (applyMessageWindow di dateGroups.js) agar testable.

## [2026-08-26] Posisi ikon di layout dinamis (Tailwind)
- **Tombol overlay di dalam input** (eye/clear/generate): input butuh padding kanan ≥
  lebar tombol + jarak — tombol 36px di right-1.5 → `pr-10`. `pr-4` membuat teks berjalan
  di bawah tombol.
- **Header dengan judul + badge + cluster tombol:** wrapper kiri `min-w-0 flex-1`, teks
  judul di-wrap `<span className="truncate">`, elemen kanan `shrink-0` — saat lebar
  menyempit, judul menyusut duluan, tombol aksi tidak pernah terpotong.
- **items-baseline vs items-center:** `items-baseline` dengan tombol ikon (tanpa teks)
  menaruh ikon mengambang tinggi (baseline tombol = tepi bawah). Untuk baris dengan
  tombol ikon + teks satu baris, `items-center` lebih aman di semua lebar.

## 2026-08-26T03:32:20Z
- Task: 
- Status: COMPLETED
- Finding: Posisi ikon di layout dinamis (Tailwind): (1) tombol overlay di input butuh padding kanan >= lebar tombol (36px → pr-10); (2) header judul+badge+cluster tombol: wrapper kiri min-w-0 flex-1 + label truncate + kanan shrink-0 agar judul menyusut duluan; (3) items-baseline dengan tombol ikon tanpa teks bikin ikon mengambang — pakai items-center.

## Pola dynamic sizing header (durable)
Header halaman list (Mail/Calendar/Contacts) wajib memakai pola konsisten saat panel menyempit:
- wrapper judul: `flex items-center gap-2 min-w-0 flex-1`
- judul: `truncate` (teks menyusut duluan)
- cluster aksi/ikon/filter: `shrink-0` (selalu utuh)
Ini mencegah konten meluber + tombol aksi terpotong pada lebar minimum panel (240px) dan mobile.

## Kalender: tanggal lokal, bukan UTC (durable)
- `toISOString()` = UTC. Untuk WIB (+7) jam 00:00–06:59 → tanggal hari
  sebelumnya. Jangan pernah format tanggal input kalender dengan toISOString.
- Helper: `src/lib/dateFormat.js` — `toLocalDateStr(d)`/`toLocalTimeStr(d)`.
- Event SOGo `eventsblocks`: `c_startdate/c_enddate` unix; recurring di-expand
  per occurrence oleh SOGo (id sama, start beda — dedup hanya id+start+calendar);
  pola repeat TIDAK ada di grid — ambil via `/view` (`repeat` object) saat perlu
  (drag/edit) agar SOGo tidak menghapus recurrence.
- End event bersifat eksklusif (all-day end = tengah malam berikutnya) →
  overlap check `s <= dayEnd && e > dayStart`.

## 2026-08-26T07:29:38Z
- Task: 
- Status: COMPLETED
- Finding: Kalender: helper tanggal lokal baru src/lib/dateFormat.js — jangan pernah pakai toISOString() utk tanggal input (UTC; WIB +7 jam 00:00-06:59 = hari sebelumnya → klik sel/event 02:00/drag dini hari pindah sehari). eventsOnDay overlap utk multi-day (end eksklusif). Drag recurring harus fetch /view utk pola repeat (grid eventsblocks tidak memuat repeat, hanya c_iscycle); keterbatasan: edit occurrence tunggal = edit seluruh seri. 54/54 PASS, live terverifikasi hash.

## Hardening error production (durable)
- Semua fetch kritis ke backend butuh deadline (`fetchWithTimeout`) — tanpa ini
  backend down = halaman menggantung tanpa pesan.
- "Failed to fetch" / "NetworkError" / "Load failed" adalah error browser-level
  → petakan ke pesan Indonesia via `isNetworkError`/`friendlyLoginError`.
- Chunk lazy-load 404 setelah deploy: `rsync --delete` menghapus chunk lama;
  tab yang masih buka memegang nama lama → import() gagal → error. Fix:
  `lazyWithReload` → reload sekali, sessionStorage flag anti-loop.

## 2026-08-26T08:12:44Z
- Task: 
- Status: COMPLETED
- Finding: Hardening error produksi: fetchWithTimeout (connectSogo 20s, registerSmtpSession 15s); friendlyLoginError petakan Failed to fetch/NetworkError/AbortError ke pesan Indonesia; lazyWithReload reload sekali saat chunk 404 pasca deploy (sessionStorage flag anti-loop). Root cause akun-spesifik masih butuh pcp_last_error dari user. 54/54 PASS, live terverifikasi hash (index-CFA4jfth, LoginPage-BZQgrSvg).

## Kontak SOGo: normalisasi field (durable)
- SOGo `Contacts/personal/view` bisa mengembalikan c_cn/c_mail/emails sebagai
  object (bukan string) → WAJIB dinormalisasi string sebelum masuk state/React.
  Pola sama dgn messageRows (subject/date object). Helper: parseContactRow di
  contactUtils.js; field `emails` bisa array string ATAU array object {email,address,value}.
- Duplikat GAL TIDAK diblokir (read-only, sah menambah salinan personal);
  duplikat personal diblokir (findDuplicateKind prioritas 'personal').

## 2026-08-26T08:27:10Z
- Task: 
- Status: COMPLETED
- Finding: Kontak SOGo: fetchContacts sekarang pakai parseContactRow murni (contactUtils.js) — field c_cn/c_mail/emails bisa object, wajib dinormalisasi string; emails bisa array string ATAU array object. ContactsPage tambah savingRef anti double-submit create. 54/54 PASS, live terverifikasi hash (index-CHLCPQI3, ContactsPage-DdssLPt0).

## Push ke GitLab saat host unreachable dari workspace (durable)
- Gejala: `git push origin main` timeout (gitlab.pcpexpress.com resolve ke
  115.178.128.141 tapi koneksi 443 hang dari environment ini).
- GitLab tetap reachable dari server `deploy-mail` (curl → 302) → buka tunnel
  SOCKS5: `ssh -f -N -D 1080 deploy-mail` (atau pakai tunnel yang sudah ada
  di port 1080) lalu push lewat proxy:
  `git -c http.proxy=socks5h://127.0.0.1:1080 push origin main`
- socks5h: DNS di-resolve di sisi server → host asli tetap → credential store
  (`~/.git-credentials`, helper `store`) cocok tanpa SSL override.

## Kalender create default jam (durable)
- Sel bulan kalender mengirim Date MIDNIGHT. Jangan langsung pakai ke modal —
  default 09:00 di `openCreateModal(date, hour=null)`; week/day view harus
  meneruskan hour asli (jam 0 pun sah untuk klik sel jam 00:00).
- Komponen date-only vs time-bearing: bedakan di CALLER, bukan di modal.

## Compose edit-draft & duplikat (durable)
- Autosave saat edit draft menyimpan ke draft BARU (createDraft+saveDraft), bukan
  menimpa draft asli. Tutup tanpa kirim harus menghapus copy (draftUidRef) —
  kalau tidak, folder Draf menumpuk duplikat. Compose baru jangan dihapus saat
  tutup (draft autosave = fitur lanjutkan dari Draf).

## 2026-08-26T08:43:38Z
- Task: 
- Status: COMPLETED
- Finding: Ai-loop menyeluruh: security & robustness bersih (XSS/tabnabbing/input validation solid dari round sebelumnya). 2 bug flow diperbaiki: (1) kalender klik sel bulan mengirim Date midnight → openCreateModal default jam 09:00, week/day kirim hour asli; (2) tutup compose edit-draft tanpa kirim → handleClose hapus copy autosave (draft asli tetap; compose baru tidak dihapus). 54/54 PASS, live (index-Dmd94Swz, CalendarPage-DWieJ8Gk, MailPage-CMVgao9L).

## Undo-delete & folder race (durable)
- Operasi yang DITUNDA (timer 6s undo-delete) wajib mengunci folder asal saat
  penjadwalan — UID SOGo bersifat PER-FOLDER; memakai selectedFolder saat
  timer fire bisa menghapus pesan yang salah di folder lain.
- Seleksi bulk harus dibersihkan saat aksi DIJADWALKAN (bukan saat promise
  selesai) untuk mencegah double-schedule / aksi kedua menyentuh uid pending.

## 2026-08-26T09:02:25Z
- Task: 
- Status: COMPLETED
- Finding: Race undo-delete: operasi tertunda (timer 6s) wajib kunci sourceFolder saat penjadwalan — UID SOGo per-folder; moveMutation pakai vars.sourceFolder; seleksi bulk dibersihkan saat DIJADWALKAN (bukan saat sukses). 55/55 PASS, live (index-JAzdFEU-, MailPage-BPYRzevc).

## Komit gabungan nginx+code = risiko overwrite file (durable)
- 6c1485f bernama "fix(nginx)" tapi diff-nya menimpa MessageReader.jsx penuh
  dengan versi lama (1014→534 baris) — kemungkinan merge/rebase salah. Fitur
  hilang diam-diam: lightbox preview, tambah-kontak, markMessagesAsJunk,
  unduh-semua, viewURL.
- Pelajaran: (1) commit nginx WAJIB hanya menyentuh configs/; (2) fitur
  MessageReader punya guard test statis (test-a11y) agar hilangnya terdeteksi;
  (3) git log -S "openPreview" berguna menemukan commit yang menghapus simbol.
- Lightbox: preview gambar via <img>, PDF via <iframe> (SOGo viewPart); Esc
  harus menutup lightbox DULU baru reader — lightbox di dep array keydown.

## 2026-08-26T09:09:50Z
- Task: 
- Status: COMPLETED
- Finding: Regresi overwrite: commit 6c1485f 'fix(nginx)' menimpa MessageReader.jsx dengan versi lama — 5 fitur hilang (lightbox preview gambar/PDF, tambah-kontak, markMessagesAsJunk, unduh-semua, viewURL). Restored + guard test-a11y statis. Pelajaran: git log -S simbol utk cari commit penghapus; commit nginx jangan campur code. 55/55 PASS, live (index-C98uu0QO, MailPage-BR9Zl6lN).

## Conversation grouping (Outlook-like) — pelajaran 2026-08-26

- Grouping by subject saja gagal untuk: (a) thread A↔B (from bergantian tapi satu percakapan), (b) dua thread beda vendor dengan subjek sama ("Invoice" dari X dan Y → harus dua percakapan).
- Solusi: cluster = subjek ternormalisasi + **partisipan overlap** (from+to, alamat akun sendiri DICUALIKAN via `selfEmail`). Tanpa pengecualian self, semua pesan ke akun yang sama jadi satu titik temu → salah menyatu.
- Baris di dalam percakapan tidak boleh punya border kiri sendiri (border-l-4) bila wrapper sudah memberi thread line — hasilnya garis ganda bertumpuk. Gunakan satu sumber border.
- Urutan grup = by pesan terbaru; pesan dalam grup = urutan input (pastikan caller menyortir date-desc dulu).

## 2026-08-26T09:25:31Z
- Task: 
- Status: COMPLETED
- Finding: Conversation grouping Outlook-like: cluster by normalized subject + participant overlap dengan selfEmail dikecualikan; baris dalam percakapan harus satu sumber border kiri (border-l-4 di dalam thread line = garis ganda bertumpuk). 55/55 test PASS, live di produksi (index-v0ElPSRV, MailPage-Cx_GFAiC).

## 2026-08-26T09:40:03Z
- Task: 
- Status: COMPLETED
- Finding: Auto-advance reader (navigateAfter) sempat hilang saat merge restore fitur 08bef9c: prop siblingUids/onNavigateTo tetap di-pass MailPage tapi tidak dikonsumsi → hapus/pindah/spam selalu tutup reader. Pola yang benar: setelah aksi, siblingUids[idx+1] ?? siblingUids[idx-1] → onNavigateTo, fallback onClose. Guard test statis wajib untuk fitur yang pernah hilang karena overwrite.

## 2026-08-26T09:57:58Z
- Task: 
- Status: COMPLETED
- Finding: Fitur lib bisa mati diam-diam walau unit test hijau: proxyExternalImages (imageProxy.js) lengkap + test 68 assertion tapi tidak pernah di-wire ke MessageReader → gambar eksternal bocor langsung ke pengirim (IP + read-receipt). Wajib assertion statis wiring di komponen untuk fitur yang berdampak keamanan/privacy. Juga: labelField 'to' utk folder Terkirim/Draf di header percakapan (konsisten dgn renderMessageRow); SOGo viewPart kirim X-Frame-Options SAMEORIGIN → iframe lightbox PDF aman.

## 2026-08-26T10:04:26Z
- Task: 
- Status: COMPLETED
- Finding: Race autosave vs tutup modal: guard harus memakai ref flag (closedRef/sentRef) karena promise in-flight tidak bisa dibatalkan — cleanup harus terjadi di sisi async setelah await selesai, bukan hanya di handler sinkron. Juga: payload onReply antar komponen harus membawa composeMode agar konsumen (ComposeModal) bisa pilih signature per mode.

## 2026-08-26T10:11:11Z
- Task: 
- Status: COMPLETED
- Finding: Overlap elemen UI: (1) event kalender di slot jam sama wajib side-by-side via kolom layout (greedy: width=100/maxCols) — full-width = saling timpa; (2) baris form dengan label+input+tombol di lebar sempit harus flex-wrap (hitung lebar min: label 64 + input min + tombol ≈ >280px inner modal 320px); (3) footer dengan cluster kiri + tombol aksi perlu flex-wrap + flex-1 min-w-0 + shrink-0.

## 2026-08-26T10:18:07Z
- Task: 
- Status: COMPLETED
- Finding: Audit overlap UI menyeluruh putaran 2: pattern yang wajib — container flex dengan min-w-0, teks truncate, elemen kanan shrink-0; badge dengan ml-auto perlu shrink-0 + truncate agar tidak saling dorong di layar sempit. Semua halaman (mail, kalender, kontak, stats, rules, login, modal) sudah diverifikasi.

## 2026-08-26T10:24:06Z
- Task: 
- Status: COMPLETED
- Finding: Pola overlap yang luput dari audit visual: elemen opacity-0 pointer-events-none TETAP reserve ruang di flex layout — di lebar sempit elemen lain bisa terjepit habis walau tidak 'tumpang tindih'. Selalu gunakan display:none (hidden) untuk aksi hover yang harus mengosongkan ruang, atau jadikan overlay absolute. Date group-hover:hidden + aksi hidden group-hover:flex = pola Gmail yang benar.

## 2026-08-26T10:29:37Z
- Task: 
- Status: COMPLETED
- Finding: Rotasi audit PreferencesPage/signatures: (1) race one-time migration — migratedRef di-set sebelum data async (fetchPreferences) tiba → migrasi di-skip selamanya; fix: guard `if (!data) return;` SEBELUM `ref.current = true` dengan deps [email, prefs]. (2) Signature HTML aman: selalu lewat DOMPurify PURIFY_CONFIG + hardenAnchorNode di 3 titik (inject editor, paste, chokepoint send) — tidak perlu sanitize di storage layer. (3) syncToSogo = aksi manual, idempotent, placeholder legacy tidak ter-sync. 119 a11y assertions, 55/55 PASS, live di produksi.

## 2026-08-26T10:43:06Z
- Task: 
- Status: COMPLETED
- Finding: Rotasi OWASP (rate-limit + data leak antar role): (1) 429 harus masuk daftar no-retry react-query — retry 429 memperparah rate-limit server (hanya 401/403/404 yang dikecualikan sebelumnya). (2) queryClient.clear() wajib di SEMUA jalur logout: session-expired sudah benar, tapi logout manual (Sidebar) & login baru (LoginPage) hanya clearUser() → cache akun A (pesan/kontak/kalender/prefs) tersisa di memori saat akun B login di perangkat sama; query key memuat sogoToken jadi tak tampil, tapi hygiene memori buruk di shared device. (3) Backend sudah solid: rate-limit per-akun (send 10/mnt key session.user), ownership /api/preferences (403 bila email != sesi), from dipaksa session.user (anti-spoof), cookie SMTP HttpOnly+SameSite=Strict+Path=/api (CSRF tertutup via preflight JSON juga). 123 a11y assertions, 55/55 PASS.

## 2026-08-26T10:50:02Z
- Task: 
- Status: COMPLETED
- Finding: Rotasi CalendarPage recurring: (1) data loss: save event recurring tanpa repeat → SOGo menimpa recurrence (pola hilang); semua jalur edit/drag wajib resolve repeat via /view sebelum save atau TOLAK save (safety net: isRecurring && !repeat && !repeatTouched). Edit event berulang harus diblokir saat detail /view gagal — fallback ke data grid (eventsblocks) yang tanpa repeat = pola rusak. (2) Hapus occurrence recurring = hapus SELURUH seri (satu UID) — konfirmasi wajib menyebut scope. (3) Fitur edit/hapus satu occurrence butuh recurrence_id/EXDATE (SOGo 5) — workstream terpisah. 129 a11y assertions, 55/55 PASS.

## 2026-08-26T13:44:54Z
- Task: 
- Status: COMPLETED
- Finding: Rotasi audit RulesPage (auto-archive vs snooze vs filter kategori): (1) sessionStorage adalah PER-TAB — klaim multi-tab yang memakai sessionStorage tidak pernah terlihat antar tab (double-move tetap terjadi); fix pakai localStorage (shared) + ownership per-instance + release hanya klaim sendiri + storage listener (bump state → re-run engine) untuk menutup race klaim berbarengan. Pelajaran: fitur multi-tab wajib diuji dengan DUA instance storage terpisah, bukan satu storage bersama (test lama lolos walau perilaku asli salah). (2) Setiap jalur yang memindahkan pesan (manual run-now vs engine otomatis) harus konsisten soal snooze: pesan di-snooze = 'tunda utk DILIHAT' → jangan pernah dipindah rule di jalur mana pun, dan TANDAI processed agar tidak di-arsip ulang saat bangun (pola Gmail: filter tidak dijalankan ulang saat wake; konsekuensi: rule baru tidak berlaku retroaktif ke pesan yang sudah di-snooze). (3) Hitung kategori client-side (countCategories) harus memakai pesan yang BENAR-BENAR terlihat — pesan tersembunyi (snooze) yang ikut dihitung membuat tab 'Promosi 5' padahal daftar 3. 137 a11y assertions, 55/55 PASS.

## 2026-08-26T14:06:36Z
- Task: 
- Status: COMPLETED
- Finding: Fitur edit/hapus SATU occurrence event berulang (SOGo 5) selesai — kontrak recurrence DIVERSIFIKASI dari source, bukan tebakan: (1) eventsblocks mengirim c_recurrence_id per baris occurrence = unix detik start (all-day: GMT midnight); (2) path occurrence SOGo 5 = Calendar/{cal}/{uid}/occurence{unixSec}/view|save|delete — server resolve via SOGoCalendarComponent.lookupName (hasPrefix 'occurence' + substringFromIndex:9 = intValue), bukan field recurrence_id di body; (3) save occurrence = exception RECURRENCE-ID (repeat WAJIB null di payload — mengirim repeat justru mengubah pola SERI); (4) delete occurrence = EXDATE di master (SOGoComponentOccurence.prepareDelete); (5) tanpa segmen occurrence, save/delete menyentuh SELURUH seri. Pelajaran: kontrak API pihak ketiga harus diverifikasi dari source client+server (UI SOGo 5.12.10 Component.service.js/Resource.service.js + file .m server) + diuji runtime (mock fetch memverifikasi URL occurence{ts} dan body tanpa repeat), bukan hanya assertion statis string. 146 a11y assertions, 55/55 PASS.

## 2026-08-26T14:18:09Z
- Task: 
- Status: COMPLETED
- Finding: Drag scope occurrence kalender: drag SATU kejadian event berulang kini memindahkan hanya kejadian itu (exception RECURRENCE-ID via segmen occurence{ts}), bukan seluruh seri — konsisten dengan fitur edit/hapus occurrence. Implementasi: handleDragStart menyimpan { ev, series: !!e.shiftKey } (semua view meneruskan native event drag), handleDrop mengirim payload editScope 'single' + occurrenceId + repeat null + repeatTouched false saat occurrence && !series; Shift+drag mempertahankan jalur lama (pindah seri, repeat master di-resolve via /view). Pelajaran: konsistensi scope (edit/hapus/drag) pada recurring event penting — semua gesture harus default scope single utk occurrence, dengan jalur eksplisit (Shift) utk seluruh seri. 149 a11y assertions, 55/55 PASS.

## 2026-08-26T16:06:47Z
- Task: 
- Status: COMPLETED
- Finding: Kontrak SOGo kontak (diverifikasi source 5.12.10 + UI live): (1) create kontak = POST {pid}/_new_/saveAsContact + body c_component:'vcard' — server lookupName di SOGoContactGCSFolder hanya membuat objek baru bila URL berakhiran AsContact/AsList, jadi POST .../new → 404; (2) delete kontak = GET {pid}/{uid}/delete (Resource.remove UI SOGo), POST → POSTAction WebDAV-only → 500. Pola: jangan asumsi endpoint SOGo — unduh UI SOGo live dari server produksi (mail.pcpexpress.co.id/SOGo/WebServerResources/js/...) + source server lookupName untuk verifikasi kontrak. 

## 2026-08-26T16:15:59Z
- Task: 
- Status: COMPLETED
- Finding: Fitur riwayat alamat terkirim: semua jalur kirim (compose, reply, forward, quick-reply) melewati ComposeModal.handleSend — rekam di sana cukup (grep sendMessage( memastikan tidak ada pemanggil lain). batchWithLimit (concurrency 5 + allSettled) di MailPage dipakai utk mark-all-read: SOGo tidak punya endpoint batch, Promise.all massal memicu 429/500/timeout dan menggagalkan seluruh operasi walau mayoritas sukses — pola utk batch per-uid lain. Pola parse recipient aman: isSafeRecipient + recipientAddress dari emailValidation (tolak kontrol chars, koma, ganda @). Storage per-akun baru: pcp_emailHistory_v1_<email> (≤200, sort lastUsed di baca). 

## 2026-08-26T16:24:35Z
- Task: 
- Status: COMPLETED
- Finding: Audit PreferencesPage: preferensi tampilan SOGo (SOGoMailComposeMessageType, SOGoMailReplyPlacement, SOGoFirstDayOfWeek, SOGoConfirmDelete) sebelumnya disimpan tapi TIDAK dikonsumsi webmail — pola 'setting tanpa efek'. Pola wiring: cek konsumen dgn grep sebelum menganggap setting berfungsi; query preferences pakai key ['preferences', token] (cache react-query shared antar halaman). SOGoFirstDayOfWeek: 0=Minggu,1=Senin; rotasi label hari = DAYS_ID.slice(1)+DAYS_ID[0]. SOGoConfirmDelete '0' = hapus langsung, '1' = konfirmasi (webmail pakai undo toast 6dtk sbg konfirmasi). SOGoDateFormat strftime tidak dipetakan — webmail punya format id-ID sendiri (renderDate). 

## 2026-08-27T01:16:42Z
- Task: 
- Status: COMPLETED
- Finding: Conversation view: grup dengan 1 pesan (email tunggal) jangan dirender sebagai header percakapan ala Outlook (avatar stack + badge count '1' + chevron) — render sebagai baris biasa via renderMessageRow(msg, -1, false); hanya grup >=2 pesan yang dapat header + thread line. Pola Gmail/Outlook: penanda percakapan hanya utk thread sungguhan. Logika grouping di lib murni conversations.js tidak perlu diubah — keputusan render cukup di MailPage (group.messages.length === 1). visibleOrderUids/range-select/auto-advance tidak terpengaruh karena key di SwipeableRow = msg.uid.

## 2026-08-27T02:46:37Z
- Task: 
- Status: COMPLETED
- Finding: Nginx mailcow sites-default.conf.j2 level-server meng-inherit X-Frame-Options SAMEORIGIN + HSTS 15768000 ke SEMUA location tanpa add_header sendiri — termasuk location /api proxy milik kita → konflik dgn header server.js (DENY/31536000), browser lihat 2 nilai XFO beda. Fix pola: di tiap location /api gunakan proxy_hide_header (buang header upstream server.js utk nama yg sama) + add_header konsisten (nilai identik dgn server.js) — hasil SATU header bersih. Server.js juga harus set HSTS sendiri (jangan andalkan nginx) + Cache-Control no-store utk data email sensitif; image-proxy tetap public immutable (cacheable). Verifikasi duplikat header: curl -D - | grep -c 'header-name:' harus 1.

## 2026-08-27T02:48:30Z
- Task: 
- Status: COMPLETED
- Finding: Nginx: expires -1 menghasilkan Cache-Control: no-cache + header Expires terpisah — bila blok lokasi JUGAA punya add_header Cache-Control sendiri, hasilnya DUA header Cache-Control dgn nilai berbeda (no-cache + no-store) yg membingungkan parser header. Utk SPA no-store cukup satu add_header Cache-Control; jangan kombinasikan dgn expires -1. Validasi: curl -sI index.html | grep -c cache-control harus 1.

## 2026-08-27T02:55:27Z
- Task: 
- Status: COMPLETED
- Finding: Pola bug: textarea plain mode yang menampilkan value dgn regex strip-tag (body.replace(/<[^>]*>?/gm,'')) di SETIAP render akan memakan karakter '<' milik user (mis. 'a < b', kode) — regex tidak bisa membedakan tag asli vs teks polos. Fix: deteksi tag HTML LENGKAP (/<[a-z][^>]*>/i) dulu; hanya strip bila body benar-benar HTML, teks polos dibiarkan. Pola race paste: e.preventDefault() di handler async WAJIB dipanggil synchron SEBELUM await apapun — kalau ditunda browser sudah menjalankan paste default → konten ganda. Untuk fallback Clipboard API cek dt.types (Files / image/*) utk tahu ada gambar tanpa await.

## 2026-08-27T03:05:57Z
- Task: 
- Status: COMPLETED
- Finding: PageLoader 'Memuat...' tampil di atas karena h-full collapse di parent Suspense tanpa tinggi; fix min-h-screen di App.jsx. Deploy.sh build ulang saat deploy (npm run build) sehingga hash bundle live bisa berbeda dari build lokal (index-DEndK4RE.js vs index-Agks9UF6.js) — verifikasi fix via grep string di bundle, bukan hanya cek hash.

## 2026-08-27T03:30:48Z
- Task: 
- Status: COMPLETED
- Finding: Batch fitur live: Undo Send 180s server-side queue (kredensial AES-256-GCM di data/pending-sends.json, flush 5s, retry 3x, /api/send/undo + /api/send/pending) + Kirim Terjadwal via sendAt (wajib lewat SMTP proxy, SOGo tak dukung send-at). Dark mode auto via prefers-color-scheme dengan anti-FOUC script EKSTERNAL theme-init.js karena CSP script-src 'self' memblokir inline. PWA: sw.js network-first utk navigasi + stale-while-revalidate asset, TIDAK pernah cache /api; nginx wajib no-cache utk file non-hash (sw/theme-init/manifest) + mime application/manifest+json. NGINX LESSON: route /api baru harus ditambah location exact di configs/site.webmail.custom; tanpa itu request jatuh ke SPA fallback (200 index.html) atau 405. Route API di ROOT domain, bukan /webmail prefix.

## 2026-08-27T03:41:48Z
- Task: 
- Status: COMPLETED
- Finding: Batas lampiran webmail kini env-configurable: SMTP_MAX_ATTACHMENT_MB (default 20), SMTP_MAX_TOTAL_MB (60), SMTP_MAX_ATTACHMENTS (10) — server.js menghitung body limit express dari nilai tsb (jangan hardcode '30mb'). GET /api/send/config mengekspos batas ke frontend (ComposeModal fetch saat buka). Control-tower punya GET/POST /api/webmail/send-config yang menulis .env sogo-proxy + restart sogo-smtp-proxy via exec child — PENTING: systemctl --user dari proses node non-login butuh XDG_RUNTIME_DIR=/run/user/1000 eksplisit. Route /api baru wajib ditambah location exact di configs/site.webmail.custom (tanpa itu SPA fallback 200/405).
