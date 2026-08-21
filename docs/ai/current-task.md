# Current Task

Status: COMPLETED
Task ID: 20260821-storage-migrate-helper
Started At: 2026-08-21T14:00:00Z
Updated At: 2026-08-21T10:10:41Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Buat helper bersama `src/lib/storageMigrate.js` agar pola baca + write-back
migrasi idempotent tidak diulang manual di tiap modul storage.

## Helper baru (`src/lib/storageMigrate.js`)
- `readJSON(key)` — baca + parse JSON; null bila key tidak ada / JSON rusak
  (menggantikan `try { JSON.parse(localStorage.getItem(...)) } catch` per modul).
- `writeJSON(key, value)` — tulis (stringify) dibungkus try/catch; true bila
  tertulis. Dipakai saat pemanggil sudah tahu bentuk berubah (flag `migrated`/
  `changed`/bentuk rusak).
- `writeIfChanged(key, original, normalized)` — tulis HANYA bila JSON.stringify
  berbeda (struktur kecil: rules/prefs); idempotent.

## Refactor (pola yang sama di semua modul)
- `signatures.js` — readJSON + writeJSON (flag migrated)
- `snooze.js` — readJSON + writeJSON (flag changed / bentuk rusak)
- `flagColors.js` — readJSON + writeJSON (prune / bentuk rusak)
- `autoArchive.js` — readJSON + writeJSON([]) + writeIfChanged
- `api.js loadPrefsFromLocal` — readJSON + writeIfChanged
- `userPrefs.js loadPrefs` — readJSON + writeIfChanged

## Perubahan perilaku yang disengaja (didokumentasikan)
- JSON `'null'` tersimpan kini dianggap "tidak ada data" (readJSON → null) —
  TIDAK lagi ditulis ulang menjadi `{}`/`[]`. Konsumen mendapat nilai yang sama
  ({}/[]/null); hanya pembersihan storage untuk literal-null yang tidak
  dilakukan (benign). Test disesuaikan: pembersihan tetap diuji untuk bentuk
  rusak yang bisa di-parse (array/string/object salah bentuk).

## Test
- Baru `test:storage-migrate` (readJSON/writeJSON/writeIfChanged + simulasi
  setItem gagal).
- Semua test modul storage (signatures, snooze, flagColors, autoarchive,
  user-prefs, preferences-fallback) tetap PASS setelah refactor.

## Validation
- 39/39 test PASS · npm run build OK

## Files Changed
- src/lib/storageMigrate.js (baru)
- src/lib/signatures.js, snooze.js, flagColors.js, autoArchive.js, api.js,
  userPrefs.js
- scripts/test-storage-migrate.mjs (baru), test-snooze.mjs, test-flag-colors.mjs,
  test-preferences-fallback.mjs
- package.json (+test:storage-migrate)
