# Project Knowledge Log

Record durable findings discovered during completed tasks. Include codebase,
architecture, infrastructure, CI/CD, deployment, operations, constraints,
bugs, and validation knowledge. Do not record secrets or transient debug logs.

## Entries

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
