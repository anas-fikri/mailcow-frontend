# Current Task

## Task: ai-loop sorting — konflik sortAsc + conversation view + group-by-tanggal di MailPage

**Status: SELESAI (49/49 test PASS, build OK)** → siap commit + push + deploy.

## Temuan

1. **Sort by UID, bukan tanggal.** `sortedMessages` mengurutkan by `uid`
   (asc/desc sesuai sortAsc). UID SOGo per-folder TIDAK dijamin sekuensial
   dengan waktu → urutan tampil bisa menyimpang dari tanggal. Saat `sortAsc`
   (terlama dulu) urutan baris terbalik total → date-group header muncul
   TERBALIK (Lebih Lama di atas, Hari Ini di bawah) + sticky header "Lebih
   Lama" menempel saat scroll melewati pesan baru.
2. **Conversation view mengabaikan sortAsc.** `groupMessages` selalu urutkan
   grup by max-UID descending → toggle sort tidak berpengaruh di conversation
   view (inkonsisten dgn flat view).
3. **Fallback `visibleOrderUids` kosong** saat conversation view aktif tapi
   `conversationGroups` kosong (semua subjek unik) → range-select / auto-advance
   reader / keyboard navigation mati di kondisi tsb.
4. **Keyboard focus pakai urutan berbeda dari render.** `focusIdx` (j/k)
   menunjuk `messages` (uid-sort) sedangkan render baris memakai indeks
   date-group (sortedMessages) → highlight fokus bisa menunjuk pesan yang
   berbeda dari yang dirender.

## Perbaikan

- **`sortMessagesByDate(messages, {asc, getDate, now})`** di `src/lib/dateGroups.js`
  — urut by DATE (parseMessageDate toleran), tiebreak uid desc, unparseable
  paling bawah. `asc` TIDAK membalik baris — hanya urutan GRUP (dipanggil
  `reorderDateGroups` / `groupMessages` asc).
- **`reorderDateGroups(groups, asc)`** — balik urutan grup tanggal saat asc
  (header Lebih Lama → Hari Ini), isi tiap grup tetap date-descending.
- **MailPage:** `sortedMessages` = `sortMessagesByDate(displayMessages)`
  (selalu date-desc); flat view render `reorderDateGroups(groupMessagesByDate(...), sortAsc)`;
  `groupMessages(messages, sortAsc)` — asc membalik urutan THREAD, pesan dalam
  thread tetap terbaru-dulu (pola Gmail).
- **Keyboard focus** (j/k/o/enter/targetUids/scroll-into-view/clamp) kini pakai
  `sortedMessages` — konsisten dengan urutan render. Deps handler + `sortedMessages`.
- `visibleOrderUids` fallback ke `sortedMessages` bila conversationGroups kosong.

## Verifikasi

- `test:date-groups` diperluas: sortMessagesByDate (date-desc + tiebreak +
  unparseable), asc tidak membalik baris, getDate custom, reorderDateGroups
  (asc → header terbalik, isi grup tetap), semua-invalid → uid-desc.
- **49/49 test PASS** · build OK.

Status: COMPLETED
Updated At: 2026-08-26T02:23:56Z
