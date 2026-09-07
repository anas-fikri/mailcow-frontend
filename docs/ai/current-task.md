# Current Task

Status: COMPLETED
Task ID: 20260907-DEPLOY-RELOAD-FAST
Updated At: 2026-09-07T07:05:46Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Reduce deploy-reload delay so stale tabs pick up new bundles sooner next deploy.

## Result
- deployCheck.js: poll 60 dtk (visible tab) + cek SEGERA saat tab kembali
  visible/focus, throttle ≥30 dtk. windowRef injectable utk test.
- public/sw.js v8: probe `?bv=` network-only (cache anti-bengkak); main.jsx
  register sw.js?v=8.
- Validasi: suite 87/87 PASS (termasuk kontrak baru), build bersih, deploy
  OK, SW v8 + interval 6e4 terverifikasi live di .com & .co.id (md5 identik).
- Commit e855901 ter-push ke GitLab via SOCKS tunnel 1080.

## Next
- Opsional: monitor pickup-time pada deploy berikutnya (log nginx: jeda
  deploy → request index.html?bv= pertama per user) untuk konfirmasi lapangan.
