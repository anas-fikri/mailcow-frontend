# Current Task — Riwayat alamat terkirim (autocomplete) + fix "Gagal menandai semua pesan"

## Status
Selesai ✅ — riwayat alamat yang pernah dikirim direkam per-akun (localStorage) dan dipakai autocomplete di Kepada/Cc/Bcc (gabung dengan kontak, pola Gmail "people you've emailed"). Mark-all-read diperbaiki: skip sudah-dibaca, concurrency dibatasi, toleran gagal parsial. 56/56 test PASS, build OK, live di produksi, ter-push.

## Fitur: Riwayat alamat terkirim (`src/lib/emailHistory.js`)
- `recordSentRecipients(accountEmail, to, cc, bcc)` dipanggil SETELAH kirim sukses di ComposeModal (semua kirim lewat sini — reply/forward/quick-reply juga, karena tidak ada jalur send lain di src/).
- Storage per-akun `pcp_emailHistory_v1_<email>` → `[{email, name, lastUsed}]` (≤200, urut lastUsed terbaru, sort di baca). Parse pakai `isSafeRecipient`+`recipientAddress` (tolak kontrol chars/koma/ganda @).
- `getEmailSuggestions(accountEmail, contacts, query)` = kontak (diutamakan) + riwayat, dedup per email, skor prefix email > prefix nama > substring, min 2 karakter.

## Fix: "Gagal menandai semua pesan."
- Root cause: `Promise.all(messages.map(markRead))` = puluhan request paralel → 429/500/timeout → Promise.all reject walau mayoritas sukses.
- Fix: `batchWithLimit` (concurrency 5, allSettled) + skip `!m.isRead` + pesan jujur: sukses sebagian → "N dari M ditandai (X gagal)".

## Next
- Verifikasi browser: kirim email ke alamat baru → buka compose lagi → ketik 2 huruf → alamat muncul di saran; klik "Tandai semua dibaca" di folder berisi banyak email → tidak ada lagi "Gagal menandai semua pesan" (sukses atau pesan parsial jujur).
Status: COMPLETED
Updated At: 2026-08-26T16:15:59Z
