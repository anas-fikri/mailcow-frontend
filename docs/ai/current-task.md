# Current Task

Status: COMPLETED
Task ID: 20260905-MAILPAGE-AUDIT
Updated At: 2026-09-05T08:30:00Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Audit mendalam halaman /webmail/mail: flow, fitur, fungsi — cari bugs.

## Result
- Arsitektur dipetakan penuh: MailPage.jsx (2.8k baris) + 10 lib pendukung
  (dateGroups, conversations, messageRows, mailboxTree, autoArchive, snooze,
  flagColors, crossTab, messageHtml, api) + MessageReader/ComposeModal.
- 3 bug flow ditemukan & diperbaiki:
  1. Filter (flag/kategori/unread/lampiran) hanya menjangkau window paginasi
     — header infinite-scroll tidak lolos filter (kontras counter vs isi).
     Fix: filter → lalu slice (`filteredLoadedMessages`).
  2. Entri flag-color yatim setelah move/delete (uid SOGo per-folder dipakai
     ulang) → pesan baru membawa warna lama. Fix: `removeFlagColorsBulk`
     di 4 jalur mutasi.
  3. quickReply menyuntik HTML email mentah ke compose (editor hanya
     sanitasi setelah user edit). Fix: sanitize di sumber (PURIFY_CONFIG).
- Test baru `scripts/test-mail-filter-pagination.mjs`; kontrak test
  conversation di-update. Suite 82/82 PASS, build OK.
- Tidak ditemukan: XSS di reader (prepareHtmlContent + EMAIL_PURIFY_CONFIG
  solid), injeksi di folder path (pathSegment guard + /0/ abs-path fix),
  race rules multi-tab (klaim localStorage ownership-based).

## Next
- Deploy: `SERVER=deploy-mail ./deploy.sh` (belum — menunggu instruksi).
- Backlog: folder-scoping penuh utk flag-color store bila fitur dipakai luas.
