# Current Task

Status: COMPLETED
Task ID: 20260821-data-normalization-audit
Started At: 2026-08-21T10:40:00Z
Updated At: 2026-08-21T09:38:37Z
Project Root: /home/anas.fikri/mailcow-frontend

## Objective
Audit semua akses data localStorage/API yang tanpa guard di seluruh halaman dan
tambahkan normalisasi serupa (pola loadSignatures) — lanjutan dari fix crash
Settings (signature legacy tanpa html).

## Temuan & Perbaikan (semua normalisasi di SOURCE reader)

1. **`src/lib/autoArchive.js` `getRules`** [HIGH] — sebelumnya `JSON.parse` mentah.
   Data non-array → `rules.map` di RulesPage crash; `c.value.trim()` di matchRules
   crash saat value non-string. Sekarang difilter + dinormalisasi:
   `{ id, name, enabled, conditions[{field,operator,value→string}], matchType,
   actionFolder, createdAt, runCount, lastRunAt }`. Melindungi RulesPage render
   + engine matchRules/executeRules/getRuleSummary.
2. **`src/lib/api.js` `loadPrefsFromLocal`** — cache `sogo_prefs_<email>` dari
   versi lama bisa berbentuk apa pun. Sekarang selalu kembalikan
   `{ defaults: {}, settings: {} }` (non-object → bentuk kosong valid), agar
   akses `prefs.defaults.SOGo*` di Settings aman.
3. **`src/lib/api.js` `fetchContacts`** — baris non-array (null/string) dibuang
   (pola parseMessageRow: `if (!Array.isArray(row)) return null` + filter).
4. **`src/lib/snooze.js` `loadSnoozes`** — nilai dinormalisasi ke number;
   null/true/NaN dibuang (Number(null)=0 & Number(true)=1 adalah koersi tak
   diinginkan dari data rusak). isSnoozed/pruneExpired jadi deterministik.
5. **`src/lib/mailboxTree.js` `flattenMailboxes`** — entri null/non-object
   dilewati; path/name di-coerce String(); entri tanpa path & name dibuang;
   children non-array tidak crash.
6. **`src/lib/flagColors.js` `getStore`** — JSON "null"/array/string → {}.

## Tidak perlu diubah (sudah aman)
- parseMessageRows/parseMessageRow (subject/date di-coerce String, row non-array
  dibuang), fetchCalendarEvents (title fallback, Number()||0), userPrefs
  loadPrefs (sudah validasi bentuk), MessageReader/ComposeModal (optional
  chaining localSig?.html), StatsPage, authStore rehydrate (zustand merge aman).

## Test
- Baru `test:autoarchive` (normalisasi getRules + matchRules aman + round-trip addRule)
- Diperluas: `test:snooze`, `test:mailbox-tree`, `test:preferences-fallback`
  (assert normalisasi data legacy/rusak), `test:signatures` (sebelumnya)

## Validation
- 36/36 test PASS · npm run build OK

## Files Changed
- src/lib/autoArchive.js, api.js, snooze.js, mailboxTree.js, flagColors.js
- scripts/test-autoarchive.mjs (baru), test-snooze.mjs, test-mailbox-tree.mjs,
  test-preferences-fallback.mjs
- package.json (+test:autoarchive)
