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
