# Current Task

Status: COMPLETED
Task ID: 20260905-STALE-TAB-RELOAD-FIX
Updated At: 2026-09-05T09:45:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Lanjutan laporan user: pesan error login versi lama muncul dari tab basi. Akar ditelusuri & diperbaiki.

## Result
- **Akar sebenarnya**: `startDeployPolling()` tanpa `baseUrl` → fetch `/index.html` 404 → auto-reload-on-deploy **no-op diam-diam sejak awal** (bukan sekadar tab yang kebetulan tidak reload).
- **Fix 1**: App.jsx kirim `baseUrl: '/webmail'` — poller URL kini 200 (diverifikasi produksi).
- **Fix 2**: LoginPage.jsx — pada login gagal, cek & reload sekali bila build server lebih baru (`checkAndReloadOnNewDeploy`).
- **Regression contract**: test-deploy-check.mjs assert kedua call site memakai `baseUrl: '/webmail'`.
- Suite **81/81**; deploy OK; bundle live md5-identik (`index-ZG4KrZ2c.js`, `LoginPage-DEw9QdHq.js`).

## Next
- Push akumulasi commit lokal ke GitLab saat jendela push.
- (Opsional) Pantau 1-2 hari: tidak ada lagi laporan "pesan lama" berarti fix efektif.
