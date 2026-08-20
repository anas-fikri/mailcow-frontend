# Current Task

Status: COMPLETED
Task ID: 20260820-134013-202650
Started At: 2026-08-20T13:40:13Z
Updated At: 2026-08-20T13:40:24Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: favicon envelope (SVG) + apple-touch-icon meta

## Goal Link
Goal ID: UI polish

## Files Involved
- public/favicon.svg (baru) — envelope 64x64, blue (#3b82f6) bg + white envelope
- index.html — tambah apple-touch-icon + theme-color meta

## Summary
index.html sudah mereferensikan /webmail/favicon.svg sebelum favicon ada.
Tambah SVG envelope (sesuai konteks mail webmail) yang konsisten dengan
ikon Mail di Sidebar (lucide-react). Background biru utama (default theme
hue 221) + envelope putih outline + V-flap.

Modern browser (Chrome 80+, Firefox 41+, Safari 12+, Edge 79+) dukung
SVG favicon. iOS Safari pakai apple-touch-icon — kami pakai SVG yang
sama (iOS 14+ support).

## Risks
- Browser lama tdk dukung SVG favicon → fallback ke default ikon browser
  (tidak ada 404 karena tak request favicon.ico).
- RGB-mismatch dengan theme user yang bukan default (theme hue configurable).
  Hex #3b82f6 adalah default Tailwind blue-500 — close ke default primary.

## Validation
- 18/18 test PASS
- npm run build OK
- dist/favicon.svg ada & well-formed (582 bytes)
