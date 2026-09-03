# Current Task

Status: COMPLETED
Task ID: 20260903-090000-000001
Started At: 2026-09-03T08:30:00Z
Updated At: 2026-09-03T09:00:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
T-MAIL-DATE-2026-09-03: email terbaru tidak tampil di webmail (terlihat 28 Agustus) padahal SOGo/mail client menampilkan email terbaru

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-011

## Files Involved
- src/lib/dateGroups.js
- scripts/test-date-groups.mjs
- docs/ai/knowledge.md
- docs/ai/handoff.md
- docs/ai/current-task.md

## Next Steps
- [DONE] Bukti ground truth: Dovecot uid 192 (2 Sep 18:37), SOGo sehat, deploy terverifikasi live, SW v7 skip /SOGo/ — masalah bukan delivery/cache
- [DONE] Root cause: RelativeDate SOGo locale Indonesia ("Hari ini 09:41", "Kamis 12:36", "28/08/2026") gagal Date.parse → ts=-Infinity → pesan ≤1 minggu tenggelam saat sort by date (f152e84, deploy 28 Agu)
- [DONE] Fix parseIndoRelativeDate + tiebreak uid numerik di src/lib/dateGroups.js
- [DONE] Regression 75/75 PASS + vite build PASS
- [DONE] Deploy produksi (SERVER=deploy-mail ./deploy.sh) + verifikasi chunk tersaji memuat parser baru
- Push ke GitLab ditunda sampai tunnel wg0 hidup (34 commit lokal menunggu, termasuk 116ccb9)

## Risk Analysis
- Status: COMPLETE
- Risk level: LOW
- Impact surface: parsing/sorting tanggal daftar pesan saja; tidak menyentuh fetch, auth, atau backend.
- Security concerns: tidak ada penanganan kredensial; parser murni fungsi string→Date.
- Compatibility concerns: fallback tetap Date.parse untuk format ISO/RFC; unparseable tetap masuk bucket 'older' + tampil (window menganggap dalam rentang).
- Failure modes/edge cases: weekday tanpa jam (default 00:00); tanggal tanpa tahun (tahun berjalan, rollback bila masa depan >36 jam); "dd/mm" ambigu tetap dibaca day-first (format ID konsisten di SOGo locale ini).
- Mitigations: 16 assertion format di scripts/test-date-groups.mjs memakai string asli SOGo 'id'; sort end-to-end assertion memastikan "Hari ini" di atas "28/08/2026".
- Validation plan: 75 regression scripts + vite build + verifikasi chunk produksi via curl.

## Risks
- Bila admin mengubah locale SOGo (mis. ke 'en'), format berubah — parser sudah mencakup literal English umum (today/yesterday/weekday EN) dan Date.parse untuk absolut EN.

## Validation
- Risk analysis: COMPLETE
- Tests/checks: 75/75 PASS; vite build PASS; deploy produksi 2026-09-03 PASS (webmail HTTP 200, /api/health 200, image-proxy SSRF 403 OK); chunk MailPage tersaji produksi terverifikasi memuat parseIndoRelativeDate. Commit 116ccb9; GitLab push ditunda sampai tunnel wg0 hidup kembali.
