# Current Task

## Task: ai-loop flow logic — interaksi auto-archive vs snooze vs filter kategori (pesan di-snooze lalu di-archive)

**Status: SELESAI (49/49 test PASS, build OK)** → siap commit + push + deploy.

## Temuan

1. **Snooze TIDAK folder-scoped (schema v2 flat `{uid: wakeEpoch}`).** SOGo memberi
   UID per-folder — pesan yang dipindah (arsip/move) mendapat UID BARU di folder
   tujuan. Entri snooze berisi uid lama menjadi YATIM: uid lama tidak lagi merujuk
   pesan itu, dan bila UID dipakai ulang oleh pesan inbox baru, pesan baru ikut
   tersembunyi (stale false-positive).
2. **Auto-archive memindah pesan yang sedang di-snooze.** `executeRules` tidak
   mengecualikan pesan snooze → pesan yang user minta "tunda sampai besok" bisa
   dipindah diam-diam oleh rule → snooze jadi sia-sia + entri stale.
3. **Tidak ada pembersihan entri snooze saat move/delete/archive.** Entri yatim
   menumpuk dan bisa salah sembunyikan pesan baru.

## Perbaikan

1. **Snooze v3 folder-scoped** (`src/lib/snooze.js`): storage
   `pcp_snooze_v3_<email>` → `{ [folderId]: { [uid]: wakeEpoch } }`. Migrasi
   sekali-jalan dari v2 flat (dibaca via `readStorage(BASE_KEY, email, 3)` —
   versi per-domain, TIDAK mengubah `STORAGE_VERSION` global agar key domain
   lain tidak ikut naik). Semua fungsi terima `folderId`:
   `snoozeMessage/unsnoozeMessage/isSnoozed(email, folderId, ...)`.
2. **`executeRules` param baru `isExcluded(msg)`** — pesan yang sedang di-snooze
   TIDAK dipindah rule (keinginan user "tunda" dihormati; rule jalan utk pesan
   lain; pesan tidak hilang ke folder lain saat masih snooze).
3. **Helper `unsnoozeMessages(email, folderId, uids)`** — dipanggil di
   onSuccess semua mutation pemindah: moveMutation, quickMoveMutation,
   junkMutation, archiveMutation (MailPage) + deleteMutation/moveMutation
   (MessageReader). Bump `snoozeTick` (via `clearSnoozesForMoved` /
   `onSnoozeCleared`) agar memo `snoozedUids` ter-refresh langsung (tanpa
   menunggu interval 60 detik).

## Verifikasi aman (tidak diubah)

- Filter kategori (`classifyEmail`) tetap berbasis folderId+from+subject —
  independen dari snooze/archive; tab count tetap hitung semua pesan (termasuk
  snooze) — pola Gmail.
- Auto-advance reader memakai `visibleOrderUids` yang sudah filter snooze.
- `pruneExpired` sekarang membersihkan per-folder + hapus folder kosong.

## Test

- `test:snooze` diperluas: folder-scope (uid sama di folder beda tidak ikut
  tersembunyi), `unsnoozeMessages` (hanya uid target), migrasi v2→v3, bentuk
  rusak v3.
- `test:autoarchive` + kasus interaksi: tanpa isExcluded semua dipindah; dengan
  isExcluded hanya pesan non-snooze; semua snooze → tanpa aksi.
- **49/49 test PASS** · build OK.

Status: COMPLETED
Updated At: 2026-08-26T02:4x:00Z
