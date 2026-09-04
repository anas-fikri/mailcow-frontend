# Current Task

Status: COMPLETED
Task ID: 20260904-GOLDEN-RETEST-MAIL
Updated At: 2026-09-04T07:40:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Retest audit halaman /webmail/mail menggunakan **golden-sample data produksi**
untuk SEMUA parser & formatter — menyusul pelajaran bug sort email yang lolos
audit flow biasa.

## Result
- Capture respons SOGo produksi ASLI (diag2, locale English): list INBOX
  (4 varian RelativeDate sekaligus: "14:24", "04:38", "Tuesday 14:24",
  "27-Aug-26"), detail pesan multipart dgn lampiran PDF, folders (7 mailbox).
  Resep capture permanen: `scripts/capture-mail-golden.sh`.
- Replay lewat implementasi nyata (`scripts/test-mail-golden.mjs`, 40+ assertion):
  parseMessageRows, sortMessagesByDate, applyMessageWindow, extractHtml,
  extractAttachments, parseSizeToBytes/formatFileSize/totalAttachmentSize,
  formatAddresses, analyzePhishing, classifyEmail, flattenMailboxes,
  groupConversations, buildMessageSearchBody.
- **2 bug ditemukan & fixed**:
  1. `renderDate` tidak pernah bisa mem-parse format detail SOGo
     "Friday, September 04, 2026 14:24 WIB" (suffix zona non-ISO → Date.parse
     NaN → string mentah Inggris ditampilkan). Fix: strip suffix zona 3-huruf
     sebelum parse (zona di-drop = benar, SOGo merender di zona user).
  2. `formatFileSize(144)` & `totalAttachmentSize` menampilkan "0 KB" untuk
     lampiran/pesanan sub-KB (Math.round(144/1024)=0). Fix: "< 1 KB → N B".
- Suite penuh 79/79 PASS, build PASS, deployed & verified live
  (build-version 1788507310996, fix ada di chunk produksi).
- Fixture permanen: `scripts/fixtures/mail-golden-{list,detail,folders}.json`
  (respons HTTP 200 asli produksi — regenerate setelah upgrade SOGo).

## Follow-up
- Golden-sample belum mencakup halaman Calendar/Contacts (parser berbeda) —
  kandidat tugas berikutnya (lihat docs/ai/next-tasks.md).
