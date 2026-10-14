---
id: T-rtc8
title: 'Webmail: preview gambar/PDF dalam lightbox saat klik lampiran'
status: done
profile: standard
created: "2026-08-19T10:45:13Z"
updated: "2026-08-19T10:45:22Z"
legacy:
  source: docs/ai/tasks/20260819-105957-306646.previous.md
  status: COMPLETED
  v1_id: 20260819-104513-330340
---

## Objective
Webmail: preview gambar/PDF dalam lightbox saat klik lampiran

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/components/mailer/MessageReader.jsx — lightbox preview (img/iframe), openPreview, viewURL di extractAttachments, Esc nutup lightbox dulu

## Next Steps
- Commit, push, deploy (SERVER=deploy-mail ./deploy.sh)
- Verifikasi live manual: preview gambar & PDF di lightbox

## Risks
- Preview PDF bergantung SOGo menyajikan file inline di iframe; bila Content-Disposition: attachment → fallback tombol "Tab baru"
- CSP (img-src 'self' data: https:, default-src 'self') memblokir blob: → preview WAJIB URL langsung /SOGo/

## Validation
- npm run build OK (10.32s)
