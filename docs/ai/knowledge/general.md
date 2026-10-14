# Knowledge: general

- Email undo-send terkirim 2–4× (laporan nadya.adriany ← bayu.gunawan) BUKAN dari
  Outlook: 12 proses `node server.js` yatim (nohup manual Agu/Sep, log
  /tmp/sogo-proxy.log) ikut mem-flush data/pending-sends.json. Ciri forensik:
  salinan ber-Date dalam hitungan detik, tanpa X-Mailer, Message-ID format
  nodemailer lama (bukan UUID v4). Cek cepat: proses node server.js dgn cwd
  sogo-proxy HARUS 1, dan `data/pending-sends.json.flush.lock` = MainPID service. <!-- aitk:k date=2026-10-14 source=migrated -->
- Jangan jalankan server.js manual (nohup) di server — selalu via
  `systemctl --user restart sogo-smtp-proxy`. Lock satu-pengirim kini mencegah
  flush ganda, tapi proses manual tetap membuang sesi & port. <!-- aitk:k date=2026-10-14 source=migrated -->
- Log container Postfix memakai WIB; journal host memakai UTC (selisih 7 jam). <!-- aitk:k date=2026-10-14 source=migrated -->
- Aturan = Sieve server-side via SOGo `defaults.SOGoSieveFilters` (urutan =
  prioritas). Terverifikasi live: SOGo membangkitkan skrip "sogo" di Dovecot
  (`address :contains "cc"`, `["to","cc"]`, `size :over NK`, `fileinto "<path>"`);
  menyimpan dgn defaults segar dari /api/preferences TIDAK mengubah 47 kunci
  lain (SOGo hanya menyusun ulang urutan kunci JSON). Daftar filter kosong →
  skrip "sogo" dihapus. Operator SOGo: `contains_not`/`is_not`/`matches_not`/
  `regex_not`; ukuran `under`/`over` dalam KB. <!-- aitk:k date=2026-10-14 source=migrated -->
- Custom `lookup` untuk http/https.request (DNS pinning anti-rebinding di
  remoteImage.js) WAJIB mendukung `opts.all === true` → callback(null, [{address,
  family}]). Node ≥20 mengaktifkan autoSelectFamily dan memanggil lookup dalam mode
  itu; membalas (address, family) → "Invalid IP address: undefined" → SEMUA gambar
  eksternal email 500 diam-diam (hanya terlihat sbg WARN di verify_image_proxy
  deploy.sh). Dijaga oleh test:pin-lookup (uji nyata http stack, bukan mock). <!-- aitk:k date=2026-10-11 source=migrated -->
- Cek SSRF di deploy.sh bisa 502 sesaat tepat setelah restart sogo-smtp-proxy
  (race startup) — cek ulang beberapa detik kemudian sebelum menyimpulkan rusak. <!-- aitk:k date=2026-10-11 source=migrated -->
- sogo-smtp-proxy adalah USER service: `systemctl --user is-active sogo-smtp-proxy`
  (versi system-level selalu "inactive"). <!-- aitk:k date=2026-10-11 source=migrated -->
- `scripts/test-*.mjs` yang tidak didaftarkan sebagai `test:*` di package.json TIDAK
  pernah dijalankan siapa pun (28 file sempat yatim, termasuk guard hook-order).
  Setiap test baru WAJIB didaftarkan. <!-- aitk:k date=2026-10-11 source=migrated -->
- Vite `transformIndexHtml` jalan per REQUEST di dev — nilai acak di sana (stamp
  build-version) membuat deployCheck melihat "versi baru" tiap poll → reload loop. <!-- aitk:k date=2026-10-11 source=migrated -->
- Memisah HTML tersanitasi sebagai STRING lalu me-render ulang tiap potongan via
  dangerouslySetInnerHTML = bypass sanitizer (marker bisa jatuh di dalam atribut).
  Selalu sanitasi ulang hasil potongan. <!-- aitk:k date=2026-10-11 source=migrated -->
- SOGo `…/{uid}/view` JSON TIDAK membawa Message-ID/In-Reply-To/References (cek fixture
  golden produksi); satu-satunya sumber = `…/{uid}/viewsource` (RFC822 mentah). Ambil
  header saja dgn streaming + abort di baris kosong pertama agar lampiran tidak ikut
  terunduh (`fetchMessageHeadersRaw`). <!-- aitk:k date=2026-10-11 source=migrated -->
- `el.focus()` pada elemen `visibility:hidden` DIABAIKAN browser — popover yang diukur
  dulu (clamp posisi) harus fokus SETELAH `pos.ready`, bukan di mount. <!-- aitk:k date=2026-10-11 source=migrated -->
- Esc untuk popover/dialog global harus ditangkap di fase CAPTURE di `document` bila
  fokus bisa berada di luar elemennya; kalau tidak, handler window MailPage yang menang. <!-- aitk:k date=2026-10-11 source=migrated -->
- Zustand-persist membaca `pcp-auth` saat reload — test runtime yang mengubah prefs
  harus mem-patch `pcp-auth.state`, bukan hanya `pcp_prefs_v2_<email>`. <!-- aitk:k date=2026-10-11 source=migrated -->
- Smoke runtime tanpa backend: vite preview + Puppeteer setRequestInterception yang
  menjawab /SOGo/* & /api/* dari fixture `scripts/fixtures/mail-golden-*.json` —
  menemukan bug yang lolos dari 76 suite statis. <!-- aitk:k date=2026-10-11 source=migrated -->
- TIDAK ADA jalur kirim webmail yang otomatis membuat salinan Sent — jalur SMTP proxy
  (/api/send) dan fallback SOGo 501 sama-sama tidak APPEND. Draft sisa (`\Draft`) yang
  user move ke Trash inilah yang terbaca "email terkirim masuk Trash". Fix: server
  APPEND salinan (Message-ID & Date identik dgn pesan terkirim) via `src/lib/sentCopy.js`. <!-- aitk:k date=2026-10-08 source=migrated -->
- imapflow v2.2.7: class di **named export** (`import { ImapFlow } from 'imapflow'`);
  `.default` = objek modul → `ImapFlow is not a constructor` jika salah. <!-- aitk:k date=2026-10-08 source=migrated -->
- imapflow `append(path, content, flags, idate)` — flags argumen ke-3 (array string),
  BUKAN objek `{ flags: [...] }`. Bentuk objek → Dovecot BAD "Flags list contains non-atoms". <!-- aitk:k date=2026-10-08 source=migrated -->
- MailComposer (nodemailer 9) SELALU strip header Bcc (`keepBcc` tidak diteruskan).
  Salinan Sent yang memuat Bcc (standar Gmail/SOGo) butuh injeksi header manual. <!-- aitk:k date=2026-10-08 source=migrated -->
- sendQueue lama: read-modify-write per operasi (lost-update race) + persist error
  (rename ENOENT dari path `${__dirname}data/`) melempar ke loop flush → entry diam.
  Fix: state in-memory + save terserialisasi + persist tak pernah melempar. <!-- aitk:k date=2026-10-08 source=migrated -->
- deploy.sh kini jalan dari workspace Linux (tanpa macOS Keychain): token fallback via
  `git credential fill`, GITLAB_USER autodetect dari credential store — token terikat
  user, fallback 'git' → 401 "HTTP Basic: Access denied". <!-- aitk:k date=2026-10-08 source=migrated -->
- Backend sogo-proxy di server butuh `PUPPETEER_SKIP_DOWNLOAD=true` saat npm install
  (postinstall puppeteer gagal tanpa Chrome cache lengkap). <!-- aitk:k date=2026-10-08 source=migrated -->
- Akun E2E diag2 di-enable via: mailbox.active=1 + reset hash BLF-CRYPT + row
  `_sogo_static_view` + flush memcached — tanpa row static view, login 403 diam-diam. <!-- aitk:k date=2026-10-08 source=migrated -->
- `deploy.sh` REMOTE_REPO_DIR default = `/home/anas.fikri/mailcow-frontend` = workspace ini.
  Deploy pull+build dari sini, lalu `git reset --hard origin/main` — workspace yang tertinggal
  bikin penilaian "bug sudah/pernah di-fix" keliru. Selalu `git fetch` + cek `main..origin/main`
  SEBELUM menganalisis kode. <!-- aitk:k date=2026-10-07 source=migrated -->
- Commit lokal yang belum di-push AKAN HILANG saat deploy berikutnya karena reset --hard.
  Push ke GitLab segera setelah commit (jangan deferral berhari-hari). <!-- aitk:k date=2026-10-07 source=migrated -->
- Hash chunk dist (api-*, index-*, MailPage-*) TIDAK comparable antar-build:
  VITE_API_KEY di-inject saat build (dari /home/anas.fikri/sogo-proxy/.env) + build-version =
  timestamp. Verifikasi kesamaan source via marker string di bundle (mis. pesan error
  fitur, `intent:``` `password` ``), bukan nama file chunk. <!-- aitk:k date=2026-10-07 source=migrated -->
- Default parameter `folder = selectedFolder` di function deklaration dalam komponen React
  mengakses state variable **sebelum** `useState()` dieksekusi. <!-- aitk:k date=2026-09-24 source=migrated -->
- Vite/Rolldown minifikasi mengubah nama variabel jadi `q`, membuat error cryptic:
  `ReferenceError: Cannot access 'q' before initialization` <!-- aitk:k date=2026-09-24 source=migrated -->
- Error boundary React menangkap ini dan menampilkan "Terjadi Kesalahan" generic. <!-- aitk:k date=2026-09-24 source=migrated -->
- **Fix:** urutkan deklarasi — `useState` dulu, baru arrow function yang pakai default param. <!-- aitk:k date=2026-09-24 source=migrated -->
- Token/keychain password harus cocok `username` GitLab. Username `git` gagal 401. <!-- aitk:k date=2026-09-24 source=migrated -->
- `security find-internet-password` + `grep '"acct"'` auto-detect username. <!-- aitk:k date=2026-09-24 source=migrated -->
- Token `***REMOVED***` valid untuk git HTTP Basic (clone/fetch) tapi 401 untuk GitLab API
  (mungkin password scope, bukan PAT scope). OK karena deploy cuma pakai git. <!-- aitk:k date=2026-09-24 source=migrated -->
- SOGo TIDAK expose endpoint changePassword yang bisa dipakai custom frontend —
  POST /SOGo/so/<token>/Preferences/changePassword selalu 404 walau
  `SOGoPasswordChangeEnabled = YES`. <!-- aitk:k date=2026-09-30 source=migrated -->
- Nginx `site.sogo.custom` memang me-route `Preferences/changePassword` ke
  sogo-proxy:3005, tapi endpoint-nya belum pernah ada di server.js → 404 →
  frontend menampilkan "Fitur ganti password tidak tersedia di server ini". <!-- aitk:k date=2026-09-30 source=migrated -->
- Solusi final (tanpa ubah nginx): POST /api/preferences dengan body
  `{intent:'password', oldPassword, newPassword}` — berbagi path dgn GET
  preferences yang sudah di-proxy nginx (`location = /api/preferences` jalan
  untuk semua method). <!-- aitk:k date=2026-09-30 source=migrated -->
- Hash mailcow = `{BLF-CRYPT}` (bcrypt). Generate via `doveadm pw -s BLF-CRYPT -p`
  di container Dovecot (tanpa dependency bcrypt di Node). Setelah UPDATE mailbox,
  flush cache auth Dovecot (`doveadm auth cache flush`) agar password langsung
  efektif; refresh session.pass in-memory agar user tetap login. <!-- aitk:k date=2026-09-30 source=migrated -->
- Verifikasi password lama pakai SMTP auth (transporter.verify()) — sumber
  kebenaran Dovecot, bukan DB. <!-- aitk:k date=2026-09-30 source=migrated -->
- Production bisa ter-deploy dari luar `deploy.sh` (developer lain build+rsync manual). <!-- aitk:k date=2026-09-30 source=migrated -->
- Cara verifikasi versi production tanpa akses server: cek `build-version` meta di index.html,
  lalu grep string unik dari commit terbaru di bundle (mis. `==401&&Z(e)` untuk fix api.js). <!-- aitk:k date=2026-09-30 source=migrated -->
- Clone server di `/home/anas.fikri/mailcow-frontend` fetch-nya butuh credential (401 tanpa token) —
  reflog server hanya jejak deploy.sh, bukan sumber kebenaran versi live. <!-- aitk:k date=2026-09-30 source=migrated -->
- Build di server: butuh nvm (Node 22 untuk Vite 6), `PUPPETEER_SKIP_DOWNLOAD=true`. <!-- aitk:k date=2026-09-24 source=migrated -->
- Git clone/fetch via `credential.helper=!f() { echo 'username=...'; echo "password=..."; }; f`
  — token dikirim via SSH env var, heredoc **quoted** (`'REMOTE_DEPLOY'`) agar token tidak
  terekspansi di local shell. Tapi `GITLAB_USER` harus terdeteksi otomatis dari Keychain. <!-- aitk:k date=2026-09-24 source=migrated -->
- Task: <!-- aitk:k date=2026-09-24 source=migrated -->
- Status: COMPLETED <!-- aitk:k date=2026-09-24 source=migrated -->
- Finding: TDZ di React: default parameter mengakses state variable sebelum useState() = ReferenceError. Vite minifikasi jadi 'q'. Fix: urutkan deklarasi. Deploy.sh via GitLab: butuh GITLAB_USER terdeteksi dari Keychain (bukan 'git'), nvm use 22 (Vite 6/Rolldown), PUPPETEER_SKIP_DOWNLOAD. Token Keychain valid untuk git HTTP Basic tapi 401 untuk GitLab API — bukan PAT scope. <!-- aitk:k date=2026-09-24 source=migrated -->
- Finding: Workspace bisa tertinggal dari GitLab karena deploy.sh pull/build dari clone ini (REMOTE_REPO_DIR sama dgn PROJECT_ROOT) lalu git reset --hard origin/main — commit unpushed hilang saat deploy berikutnya; selalu fetch dulu sebelum analisis. Hash chunk dist tidak comparable antar-build (VITE_API_KEY di-inject + build-version timestamp); verifikasi source via marker string di bundle. <!-- aitk:k date=2026-10-07 source=migrated -->
