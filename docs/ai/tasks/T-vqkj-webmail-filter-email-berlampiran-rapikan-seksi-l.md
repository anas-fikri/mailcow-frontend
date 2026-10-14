---
id: T-vqkj
title: 'Webmail: filter email berlampiran + rapikan seksi lampiran (hapus Gambar, hormati shouldDisplayAttachment)'
status: done
profile: standard
created: "2026-08-19T10:59:57Z"
updated: "2026-08-19T11:00:07Z"
legacy:
  source: docs/ai/tasks/20260819-130705-700312.previous.md
  status: COMPLETED
  v1_id: 20260819-105957-306646
---

## Objective
Webmail: filter email berlampiran + rapikan seksi lampiran (hapus Gambar, hormati shouldDisplayAttachment)

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/pages/MailPage.jsx — state hasAttachmentOnly + filter displayMessages + tombol Paperclip di header list
- src/components/mailer/MessageReader.jsx — hapus seksi 'Gambar' (inline images), extractAttachments skip shouldDisplayAttachment===false

## Next Steps
- Commit, push, deploy (SERVER=deploy-mail ./deploy.sh)
- Verifikasi live manual: toggle filter lampiran, footer lampiran satu blok

## Risks
- Bila SOGo tidak kirim shouldDisplayAttachment utk beberapa akun, gambar inline tetap masuk Lampiran (fallback aman, tanpa crash)

## Validation
- npm run build OK (5.82s)
