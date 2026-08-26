# Current Task

## Task: ai-loop multi-tab — cache React Query di CalendarPage & ContactsPage

**Status: SELESAI (51/51 test PASS, build OK)** → siap commit + push + deploy.

## Temuan

Cache React Query **per-tab** + `staleTime: 5 menit` (calendar & contacts):
- Tab A create/update/delete event atau kontak → invalidate HANYA di tab A.
- Tab B masih menampilkan data basi sampai stale (≤5 menit) atau reload manual.
- Tidak ada mekanisme sinkronisasi antar-tab untuk domain ini (MailPage sudah
  dapat storage-event utk snooze; calendar/contacts belum).

## Perbaikan

**Helper bersama `src/lib/crossTab.js` — "domain version bump":**
- `bumpDomainVersion(domain, email)` — tulis timestamp **monotonik**
  (`Math.max(Date.now(), prev+1)` — dua bump dalam ms sama tidak boleh
  menghasilkan versi sama, kalau tidak tab lain tidak mendeteksi perubahan) ke
  `pcp_<domain>_v_<email>`. Tanpa email → 0 (no-op).
- `watchDomainVersion(domain, email, cb)` — listener `storage` (event hanya
  fire di tab LAIN), invalidate saat versi naik; `e.key === null` (clear)
  dianggap semua berubah; cleanup otomatis.
- `readDomainVersion` / `pruneDomainVersions` (TTL 24 jam).

**CalendarPage:** bump `calendar` di handleCreate/Update/DeleteEvent (drag
reuse handleUpdateEvent → otomatis) + watch → invalidate `['calendar', token]`.
**ContactsPage:** bump `contacts` di create/deleteMutation onSuccess + watch →
invalidate `['contacts', token]`.

## Verifikasi

- `test:cross-tab` baru: read 0 awal, bump > 0, scoped email/domain, watch
  invalidate saat versi naik, abaikan key domain lain, abaikan event tanpa
  perubahan, clear() memicu, cleanup listener, **bump monotonik** (bug asli
  ditemukan oleh test), key rusak → 0, email kosong → 0.
- **51/51 test PASS** · build OK.

Status: COMPLETED
Updated At: 2026-08-26T02:41:56Z
