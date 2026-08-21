# Current Task

Status: COMPLETED
Task ID: 20260821-storage-writeback-rollout
Started At: 2026-08-21T12:50:00Z
Updated At: 2026-08-21T10:02:31Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Terapkan pola migrasi write-back (pola loadSignatures/LEGACY_PLACEHOLDER) ke
modul storage lain yang menyimpan bentuk lama: snooze, flagColors, rules,
prefs cache (api.js), userPrefs.

## Perubahan (semua idempotent — tulis balik HANYA saat bentuk berubah)

1. **`src/lib/snooze.js` `loadSnoozes`** — hasil normalisasi (nilai numeric)
   dipersist; bentuk rusak (null/array/string) → tulis `{}` sekali.
2. **`src/lib/flagColors.js` `getStore`** — prune key dengan warna tidak dikenal
   (legacy/rusak) lalu tulis balik; bentuk rusak → `{}` sekali.
3. **`src/lib/autoArchive.js` `getRules`** — setelah normalisasi, bandingkan
   `JSON.stringify(list) !== JSON.stringify(parsed)` → tulis balik bila beda
   (entri dibuang / field di-coerce); bentuk non-array → `[]` sekali.
4. **`src/lib/api.js` `loadPrefsFromLocal`** — cache `sogo_prefs_<email>`
   bentuk rusak / key ekstra → tulis balik `{defaults:{},settings:{}}` sekali.
5. **`src/lib/userPrefs.js` `loadPrefs`** — field hilang/nilai invalid diisi
   default lalu dipersist; array/non-object → null (tanpa tulis; kontrak
   "belum ada preferensi" dipertahankan).

Deteksi perubahan memakai `JSON.stringify` compare (list kecil) atau flag
`changed` saat loop — tidak ada write saat data sudah valid (idempotent).

## Test
- Baru `test:flag-colors` (prune + write-back + idempotent + bentuk rusak).
- Diperluas: `test:snooze`, `test:autoarchive`, `test:preferences-fallback`,
  `test:user-prefs` — assert write-back terjadi sekali + baca kedua tidak
  menulis ulang + data valid dibiarkan apa adanya.

## Validation
- 38/38 test PASS · npm run build OK

## Files Changed
- src/lib/snooze.js, flagColors.js, autoArchive.js, api.js, userPrefs.js
- scripts/test-flag-colors.mjs (baru), test-snooze.mjs, test-autoarchive.mjs,
  test-preferences-fallback.mjs, test-user-prefs.mjs
- package.json (+test:flag-colors)
