# Current Task

Status: COMPLETED
Task ID: 20260819-142636-337630
Started At: 2026-08-19T14:26:36Z
Updated At: 2026-08-19T14:26:55Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: perluas proxyExternalImages — srcset, <picture><source>, CSS background-image/url()

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-009

## Files Involved
- src/lib/imageProxy.js — tambah rewriteSrcset() (img|source srcset, pertahankan whitespace/descriptor) + rewriteCssUrls() (url(...) pada style attribute + <style> block); proxyExternalImages kini juga proses srcset + CSS url()
- scripts/test-image-proxy.mjs — test baru rewriteSrcset + rewriteCssUrls (quote single/double/tanpa, data:, multiple url, gradient)

## Next Steps
- (selesai) build + test + deploy

## Risks
- Vektor srcset/<picture>/CSS background-image sebelumnya hanya diblokir CSP (fail-closed); kini di-rewrite aktif agar gambar tetap tampil + IP tetap aman.

## Validation
- 15/15 test PASS (test:image-proxy diperluas) · npm run build OK · bundle memuat logika srcset
