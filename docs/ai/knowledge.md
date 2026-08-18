# Project Knowledge Log

Record durable findings discovered during completed tasks. Include codebase,
architecture, infrastructure, CI/CD, deployment, operations, constraints,
bugs, and validation knowledge. Do not record secrets or transient debug logs.

## Entries

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
