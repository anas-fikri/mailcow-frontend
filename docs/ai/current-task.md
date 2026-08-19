# Current Task

Status: COMPLETED
Task ID: 20260819-105957-306646
Started At: 2026-08-19T10:59:57Z
Updated At: 2026-08-19T11:00:07Z
Project Root: /home/anas.fikri/mailcow-frontend

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
