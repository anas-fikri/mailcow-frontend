# Current Task

Status: COMPLETED
Task ID: 20260819-145627-255339
Started At: 2026-08-19T14:56:27Z
Updated At: 2026-08-19T14:56:49Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: ai-loop bug hunt — fix slow-loris image-proxy + duplicate-send fallback SMTP

## Goal Link
Goal ID: G-001
Sub-goal ID: G-001.S-009

## Files Involved
- server.js — image proxy: hard deadline absolut (Date.now()+10s) untuk SELURUH fetch (semua redirect hop); requestImageOnce terima deadline + destroy stream bila melebihi. Mitigasi slow-loris/slow-read yang lolos dari socket idle timeout.
- src/lib/api.js — sendMessage: fallback SMTP HANYA pada 501 (bukan semua non-ok). Status 400/422/500/dll → throw, cegah kirim ganda.
- scripts/test-draft-api.mjs — test 501 → fallback /api/send, 500 → throw (tidak /api/send)

## Next Steps
- (selesai) build + test + deploy

## Risks
- Fallback SMTP kini ketat ke 501 — kalau SOGo di production ternyata return kode lain saat /send gagal, kirim akan surface error (lebih aman daripada kirim ganda).

## Validation
- 16/16 test PASS · npm run build OK · node --check server.js OK
