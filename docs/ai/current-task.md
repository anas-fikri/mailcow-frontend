# Current Task

## 2026-08-27 — Batas lampiran email 4MB → 20MB + konfigurasi di Control Tower

**Status:** ✅ selesai & LIVE di kedua repo (webmail + control-tower), semua test PASS.

## Webmail (repo ini)
- **`src/lib/attachmentValidation.js`**: batas naik 4 MB → **20 MB per file**, **60 MB total**, 10 file (default). Batas kini **configurable** — `validateAttachment`/`validateAttachments` menerima `limits` override.
- **server.js**: baca env `SMTP_MAX_ATTACHMENT_MB` (default 20), `SMTP_MAX_TOTAL_MB` (default 60), `SMTP_MAX_ATTACHMENTS` (default 10); body limit express dihitung dari nilai tsb (bukan hardcode 30mb). Endpoint baru **`GET /api/send/config`** → `{ maxFileMB, maxTotalMB, maxAttachments, undoSeconds }` utk frontend.
- **ComposeModal.jsx**: validasi client sinkron dengan config server (fetch `/api/send/config` saat buka; fallback 20/60/10). Pesan error dinamis ("melebihi X MB").
- **api.js**: `fetchSendConfig()` (cache 60 dtk).
- **nginx**: location baru `= /api/send/config`.
- Test: test-attachment-validation diupdate (20/60 + override case); **59/59 PASS**; build OK; deploy live.

## Control Tower (repo mailcow-controltower)
- **server.js**: `GET/POST /api/webmail/send-config` — baca/tulis `.env` sogo-proxy (`SMTP_MAX_ATTACHMENT_MB`, `SMTP_MAX_TOTAL_MB`, `SMTP_MAX_ATTACHMENTS`, `SMTP_SEND_UNDO_SECONDS`) + **restart sogo-smtp-proxy otomatis** (child process dengan `XDG_RUNTIME_DIR` eksplisit karena bukan login shell). Validasi angka 1–500; tulis idempotent (pertahankan key lain di .env).
- **Settings.jsx**: tab **"Webmail"** baru — 4 field + tombol "Simpan & Terapkan" (+ warning sesi SMTP di-reset).
- **src/lib/services/webmail.js**: client service baru.

## Verifikasi live
- `/api/send/config` → `{maxFileMB:20, maxTotalMB:60, maxAttachments:10, undoSeconds:180}` ✅
- Lampiran 21 MB → HTTP 400 "melebihi 20 MB" ✅; 19 MB → lolos validasi (401 sesi) ✅
- Control-tower POST → `{saved:true, restarted:true}` → service active → webmail baca nilai baru ✅
- Deploy: webmail `index-...` baru live; control-tower JS bundle 200, API 3003 active.
