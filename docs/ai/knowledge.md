# Project Knowledge Log

Record durable findings discovered during completed tasks. Include codebase,
architecture, infrastructure, CI/CD, deployment, operations, constraints,
bugs, and validation knowledge. Do not record secrets or transient debug logs.

## Entries

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

## 2026-08-18 — SOGo v5 move: endpoint `moveMessages`, folder = path relatif (batchMoveToMailbox TIDAK ada)

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
