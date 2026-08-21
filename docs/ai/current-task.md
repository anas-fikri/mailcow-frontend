# Current Task

## Task: Pastikan body compose selalu melalui DOMPurify sebelum dikirim

**Status: SELESAI (40/40 test PASS, live)** — commit → push + deploy.

## Ringkasan
Audit jalur kirim email: `ComposeModal.handleSend` → `sendMessage()` →
`/api/send` (SMTP proxy) / SOGo `/send`. Temuan: sanitasi sudah ada di
ComposeModal (handleSend + autosave), tetapi **chokepoint `sendMessage` di
api.js TIDAK menyanitasi ulang** — pemanggil lain / jalur masa depan bisa
mengirim HTML mentah. Ditambahkan sanitasi defense-in-depth di `sendMessage`.

## Perubahan
- `src/lib/api.js` `sendMessage`: body HTML SELALU melewati
  `DOMPurify.sanitize(body, PURIFY_CONFIG)` sebelum dikirim — berlaku utk
  ketiga jalur: SMTP langsung (ada lampiran), payload SOGo `/send`, dan
  fallback SMTP (501). Konfigurasi sama dgn editor agar konten sah tidak
  berubah. Guard `DOMPurify?.isSupported` utk lingkungan tanpa DOM (test).
- `scripts/test-send-sanitize.mjs` (baru): jsdom + mock fetch — script tag,
  onerror, javascript:/data: href dihapus; rel=noopener noreferrer dipaksa;
  link http dipertahankan; plain text tidak diubah; fallback 501 ter-sanitize.
- Terverifikasi: sanitasi ganda (ComposeModal + sendMessage) tidak merusak
  konten sah (idempotent — DOMPurify output stabil).

## Test
- **Baru `test:send-sanitize`** — 4 jalur: SMTP+attachment, SOGo+fallback 501,
  plain (isHTML=false), body kosong.
- **40/40 PASS** · `npm run build` OK.

## Next
- Server /api/send tetap percaya pada sanitasi client (Zod + validasi header +
  attachment sudah ada); tidak ada sanitize HTML di server karena DOMPurify
  butuh DOM. Pantau payload body di log bila ada keluhan.
Status: COMPLETED
Updated At: 2026-08-21T10:24:14Z
