# Durable project knowledge

## TDZ (Temporal Dead Zone) di React components (2026-09-24)
- Default parameter `folder = selectedFolder` di function deklaration dalam komponen React
  mengakses state variable **sebelum** `useState()` dieksekusi.
- Vite/Rolldown minifikasi mengubah nama variabel jadi `q`, membuat error cryptic:
  `ReferenceError: Cannot access 'q' before initialization`
- Error boundary React menangkap ini dan menampilkan "Terjadi Kesalahan" generic.
- **Fix:** urutkan deklarasi — `useState` dulu, baru arrow function yang pakai default param.

## GitLab credential flow (2026-09-24)
- Token/keychain password harus cocok `username` GitLab. Username `git` gagal 401.
- `security find-internet-password` + `grep '"acct"'` auto-detect username.
- Token `***REMOVED***` valid untuk git HTTP Basic (clone/fetch) tapi 401 untuk GitLab API
  (mungkin password scope, bukan PAT scope). OK karena deploy cuma pakai git.

## Change password mailbox (2026-09-30)
- SOGo TIDAK expose endpoint changePassword yang bisa dipakai custom frontend —
  POST /SOGo/so/<token>/Preferences/changePassword selalu 404 walau
  `SOGoPasswordChangeEnabled = YES`.
- Nginx `site.sogo.custom` memang me-route `Preferences/changePassword` ke
  sogo-proxy:3005, tapi endpoint-nya belum pernah ada di server.js → 404 →
  frontend menampilkan "Fitur ganti password tidak tersedia di server ini".
- Solusi final (tanpa ubah nginx): POST /api/preferences dengan body
  `{intent:'password', oldPassword, newPassword}` — berbagi path dgn GET
  preferences yang sudah di-proxy nginx (`location = /api/preferences` jalan
  untuk semua method).
- Hash mailcow = `{BLF-CRYPT}` (bcrypt). Generate via `doveadm pw -s BLF-CRYPT -p`
  di container Dovecot (tanpa dependency bcrypt di Node). Setelah UPDATE mailbox,
  flush cache auth Dovecot (`doveadm auth cache flush`) agar password langsung
  efektif; refresh session.pass in-memory agar user tetap login.
- Verifikasi password lama pakai SMTP auth (transporter.verify()) — sumber
  kebenaran Dovecot, bukan DB.

## Multi-developer deploy (2026-09-30)
- Production bisa ter-deploy dari luar `deploy.sh` (developer lain build+rsync manual).
- Cara verifikasi versi production tanpa akses server: cek `build-version` meta di index.html,
  lalu grep string unik dari commit terbaru di bundle (mis. `==401&&Z(e)` untuk fix api.js).
- Clone server di `/home/anas.fikri/mailcow-frontend` fetch-nya butuh credential (401 tanpa token) —
  reflog server hanya jejak deploy.sh, bukan sumber kebenaran versi live.

## Deploy.sh dari GitLab ke mailserver (2026-09-24)
- Build di server: butuh nvm (Node 22 untuk Vite 6), `PUPPETEER_SKIP_DOWNLOAD=true`.
- Git clone/fetch via `credential.helper=!f() { echo 'username=...'; echo "password=..."; }; f`
  — token dikirim via SSH env var, heredoc **quoted** (`'REMOTE_DEPLOY'`) agar token tidak
  terekspansi di local shell. Tapi `GITLAB_USER` harus terdeteksi otomatis dari Keychain.
## 2026-09-24T01:49:22Z
- Task: 
- Status: COMPLETED
- Finding: TDZ di React: default parameter mengakses state variable sebelum useState() = ReferenceError. Vite minifikasi jadi 'q'. Fix: urutkan deklarasi. Deploy.sh via GitLab: butuh GITLAB_USER terdeteksi dari Keychain (bukan 'git'), nvm use 22 (Vite 6/Rolldown), PUPPETEER_SKIP_DOWNLOAD. Token Keychain valid untuk git HTTP Basic tapi 401 untuk GitLab API — bukan PAT scope.
