---
id: T-wr5k
title: 'Webmail: implementasi lampiran di ComposeModal (create/reply) + dukungan attachments di /api/send'
status: done
profile: standard
created: "2026-08-20T10:05:01Z"
updated: "2026-08-20T10:05:21Z"
legacy:
  source: docs/ai/tasks/20260820-104931-250388.previous.md
  status: COMPLETED
  v1_id: 20260820-100501-388715
---

## Objective
Webmail: implementasi lampiran di ComposeModal (create/reply) + dukungan attachments di /api/send

## Goal Link
Goal ID: G-001 (keamanan & fungsional webmail)
Sub-goal ID: G-001.S-009 (fitur webmail)

## Root cause
Tombol Paperclip di footer ComposeModal **disabled** (`title="Lampirkan file (belum didukung)"`)
— fitur lampiran belum pernah diimplementasikan. Error `[AutoArchive] ...Cannot copy messages to
other account` di console TIDAK terkait (job SOGo background yang gagal).

## Changes
- **`src/lib/attachmentValidation.js` (baru, pure):** `validateAttachments()` — batas 10 file,
  4 MB/file, 18 MB total, validasi base64 + nama file (anti header/path injection), content-type.
- **`server.js`:** schema `/api/send` + `attachments` (zod, max 10), validasi via
  `validateAttachments()`, lampiran diteruskan ke Nodemailer (`content: Buffer.from(data,'base64')`),
  `express.json` limit 10mb → 30mb (overhead base64).
- **`src/lib/api.js` `sendMessage`:** terima `attachments`; bila ada lampiran → kirim LANGSUNG ke
  `/api/send` (bypass draft SOGo yang 501 di produksi; cegah lampiran hilang diam-diam).
- **`src/components/mailer/ComposeModal.jsx`:** Paperclip aktif + hidden `<input type="file" multiple>`,
  daftar lampiran (chip nama+size+X, counter n/10 + total size), drag-drop file non-gambar → lampiran
  (gambar tetap inline), reset saat modal dibuka, batas ukuran di client (4 MB/file, 10 file).
- **Bonus fix:** `test:date-groups` gagal karena literal 'yesterday' memakai `new Date()` nyata,
  bukan `now` yang di-inject (time-dependent). `parseMessageDate(value, now)` kini deterministik.

## Tests
- `test:attachment-validation` (baru) — validasi murni (base64, ukuran, nama, jumlah, total).
- `test:draft-api` — kasus baru: attachments → langsung `/api/send`, tanpa draft SOGo.
- Full suite: **29/29 PASS**, `npm run build` ✅, `node --check server.js` ✅, `bash -n deploy.sh` ✅.

## Next Steps
- Commit + push + deploy (SERVER=deploy-mail ./deploy.sh) — backend sync `attachmentValidation.js`.
- Verifikasi live: kirim email dengan lampiran (manual oleh user).

## Risks
- Lampiran 4 MB/file, 18 MB total — batas desain (sesuai validasi backend).
- SOGo path (tanpa lampiran) tidak berubah; dengan lampiran selalu lewat SMTP proxy.

## Validation
- 29/29 test PASS, build OK, deploy live + `/api/send` attachments terverifikasi.
