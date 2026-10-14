# Current Task

Status: COMPLETED
Task ID: 20260819-143808-382111
Started At: 2026-08-19T14:38:08Z
Updated At: 2026-08-19T14:38:25Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: test otomatis anti tracking-pixel (linkedom) — simulasi render email & assert tidak ada request langsung ke domain pengirim

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-009

## Files Involved
- src/lib/imageProxy.js — proxyExternalImages kini pakai wrapper <div> (bukan <template>) + parameter doc injectable (default global document) agar bisa diuji di Node
- scripts/test-tracking-pixel.mjs — test baru pakai linkedom: simulasi email tracking-pixel (img src, srcset, picture/source, CSS inline + <style>), assert 0 URL eksternal tersisa + round-trip proxy
- package.json + package-lock.json — tambah devDependency linkedom + script test:tracking-pixel

## Next Steps
- (selesai) build + test + deploy

## Risks
- getter innerHTML <template> di linkedom tidak merefleksikan mutasi content → ganti wrapper <div> agar konsisten browser & Node.

## Validation
- 16/16 test PASS (baru test:tracking-pixel) · npm run build OK
