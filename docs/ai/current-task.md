# Current Task

## Task: Cek /api/health butuh API key di nginx — konsisten dengan deploy.sh verify

**Status: SELESAI (49/49 test PASS, live)** → commit + push + deploy.

## Temuan
1. **`/api/health` BUTUH API key** — di-enforce di **app level** (server.js
   `app.use('/api', requireApiKey)` SEBELUM route health; live terverifikasi:
   403 tanpa key, 200 dengan key). Nginx hanya passthrough (key dicek di
   upstream) — konsisten dengan semua lokasi `/api/*`.
2. **deploy.sh preflight** sudah cek `/api/health` DENGAN key (langsung ke
   backend port 3005) ✓ — konsisten.
3. **GAP: deploy.sh `verify()` tidak cek `/api/health`** — hanya webmail +
   image-proxy. Routing nginx → backend untuk health tidak tervalidasi
   pasca-deploy.

## Perbaikan
Tambahkan `verify_health()` di deploy.sh, dipanggil dari `verify()`:
- Cek **end-to-end via nginx** (`--resolve host:443:127.0.0.1`) dengan
  `X-Api-Key` diambil dari .env server (pola awk sama seperti preflight,
  via heredoc — anti-escaping).
- Sukses bila 200; selain itu `err` (deploy tetap dilaporkan gagal).
- Konsisten: preflight (backend langsung) + verify (via nginx) memakai key
  yang sama dan mengharapkan 200.

## Keputusan
- `/api/health` TETAP di belakang API key (bukan public) — konsisten dengan
  seluruh `/api/*`; key tidak melindungi apa pun yang sensitif (health cuma
  `{ok:true}`), tapi menjaga pola seragam dan mencegah probing tanpa identitas.
- Catatan: `VITE_API_KEY` ada di bundle frontend → key adalah soft gate;
  auth sebenarnya utk /api/send & co adalah cookie SMTP httpOnly.

## Test
- `test:security-hardening` diperluas (21 assertions): `/api/health`
  didefinisikan SETELAH requireApiKey (butuh key); deploy.sh punya
  verify_health + dipanggil verify() + pakai X-Api-Key; preflight juga cek
  health. `bash -n deploy.sh` OK.
- **49/49 test PASS**

Status: COMPLETED
Updated At: 2026-08-26T02:06:03Z
