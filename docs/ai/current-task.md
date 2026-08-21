# Current Task

## Task: Versi skema pada tiap key localStorage (pcp_*_v2)

**Status: SELESAI (39/39 test PASS, live)** — commit `HEAD` → push + deploy.

## Ringkasan
Setiap domain storage localStorage kini memakai key ber-version (`*_v2_*`)
dengan fallback chain baca v2 → v1 di `storageMigrate.js`. Data legacy v1
dibaca, dinormalisasi, dipindah ke v2 sekali-jalan, lalu key v1 dihapus
(hanya bila tulis v2 sukses — quota tidak menghapus sumber).

## Modul yang dimigrasi
| Modul | v1 (legacy) | v2 (sekarang) |
|---|---|---|
| signatures.js | `pcp_signatures_<email>` | `pcp_signatures_v2_<email>` |
| snooze.js | `pcp_snooze_<email>` | `pcp_snooze_v2_<email>` |
| flagColors.js | `flag_colors_<email>` | `flag_colors_v2_<email>` |
| autoArchive.js | `auto_archive_rules_<email>` | `auto_archive_rules_v2_<email>` |
| api.js (prefs cache) | `sogo_prefs_<email>` | `sogo_prefs_v2_<email>` |
| userPrefs.js | `pcp_prefs_<email>` | `pcp_prefs_v2_<email>` |

## Helper baru di storageMigrate.js
- `STORAGE_VERSION` (2), `storageKey(base, scope, version)`,
  `readStorage(base, scope)` (baca versi tertinggi → turun; `fromLegacy`),
  `removeJSON(key)`, `persistNormalized(base, scope, parsed, normalized, info)`
  (migrasi key + write-back idempotent).

## Test
- `test:storage-migrate` diperluas: storageKey/readStorage fallback v2→v1,
  persistNormalized (migrasi + idempotent + quota gagal mempertahankan v1).
- Semua test storage di-update: seed legacy di key v1, assert hasil di key v2
  + v1 dihapus. `test-settings-signature` (e2e bundle) tetap seed v1 utk
  menguji migrasi nyata di bundle produksi.
- 39/39 PASS · build OK.

## Catatan
- JSON literal `'null'` tersimpan dianggap "tidak ada data" (readJSON → null);
  readStorage menganggap v2 `'null'` = tidak ada → fallback ke v1.
- `clearAllRules` membersihkan key v2 + v1.

## Next
- Pantau error 401/500 di produksi; kalau ada bentuk data legacy lain yang
  ditemukan, naikkan STORAGE_VERSION + tambah normalisasi di pemakai.
Status: COMPLETED
Updated At: 2026-08-21T10:18:53Z
