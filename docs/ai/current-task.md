# Current Task

## Task: ai-loop multi-tab — dua tab webmail akun sama: polling unseen, snooze prune, auto-archive race

**Status: SELESAI (50/50 test PASS, build OK)** → siap commit + push + deploy.

## Temuan

1. **Snooze tidak sinkron antar-tab.** localStorage dibagi antar tab, tapi event
   `storage` hanya ter-fire di tab LAIN (bukan yang menulis). Tab B tidak tahu
   tab A menynooze/unsnooze → daftar pesan tab B basi sampai interval 60 detik
   (atau tanpa batas bila tidak ada perubahan local).
2. **Auto-archive double-move antar-tab.** Dua tab akun sama menjalankan rule
   engine independen (query cache + rulesProcessed per-tab). Keduanya bisa
   memindahkan pesan yang SAMA bersamaan → double-move / double-toast.
3. **Notifikasi email baru** — dua tab polling unseen sama-sama memunculkan
   notifikasi; `tag: 'sogo-new-mail'` membuat browser mengganti notifikasi
   (tidak menumpuk) → aman, tidak perlu diubah.

## Perbaikan

1. **Storage event listener utk snooze** (MailPage): watch key
   `pcp_snooze_v3_<email>` / `pcp_snooze_v2_<email>` / `clear()` → bump
   `snoozeTick` saat tab lain menulis. UI langsung ter-refresh.
2. **Klaim auto-archive antar-tab** (`src/lib/autoArchive.js`):
   `claimAutoArchiveUids(email, uids)` — klaim uid di sessionStorage (per-tab,
   hilang saat tab ditutup) dengan TTL 5 menit; tab pertama menang, tab lain
   SKIP uid tsb. `releaseAutoArchiveClaims(email, uids)` — lepas klaim setelah
   move selesai/gagal. MailPage: claim sebelum executeRules, lepas utk pesan
   yang tidak jadi dipindah; `rulesProcessed` hanya di-set utk pesan yang
   BENAR-BENAR dipindah (yang di-skip karena klaim tab lain tetap bisa dicoba
   lagi saat klaim kedaluwarsa).

## Verifikasi aman

- `test:multitab` baru: claim pertama, claim tab kedua skip, scoped per email,
  release, TTL kedaluwarsa, input invalid, regresi snooze v3.
- **50/50 test PASS** · build OK.

Status: COMPLETED
Updated At: 2026-08-26T02:29:57Z
