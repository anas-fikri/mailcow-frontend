# Current Task

Status: COMPLETED
Task ID: 20260819-103030-365882
Started At: 2026-08-19T10:30:30Z
Updated At: 2026-08-19T10:30:43Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Webmail: hapus draft di daftar + infinite scroll 5 bulan inbox + lampiran smart (ikon tipe, unduh semua blob, total ukuran)

## Goal Link
Goal ID: TBD
Sub-goal ID: TBD

## Files Involved
- src/lib/attachments.js — helper murni: getFileKind, parseSizeToBytes, formatFileSize, totalAttachmentSize, fileExtension
- src/components/mailer/MessageReader.jsx — ikon per tipe file (FILE_KIND_META), unduh semua via blob + loading state, total ukuran di header lampiran
- src/pages/MailPage.jsx — tombol hapus draft di daftar (hover), infinite scroll (IntersectionObserver) + batas 5 bulan inbox (messagesInWindow)
- package.json — script test:attachments
- scripts/test-attachments.mjs — assertions kind/size/total

## Next Steps
- Commit, push, deploy (SERVER=deploy-mail ./deploy.sh)
- Verifikasi live manual: hapus draft, scroll infinite, lampiran

## Risks
- Infinite scroll hanya me-reveal ~250 email yang sudah di-fetch SOGo (cap list view) — pagination server-side (offset) belum dibuat
- Batas 5 bulan bergantung parseMessageDate (date SOGo ISO/RFC/literal/epoch); date tak terbaca dipertahankan (aman)

## Validation
- npm run build OK (4.04s)
- npm run test:attachments PASS
