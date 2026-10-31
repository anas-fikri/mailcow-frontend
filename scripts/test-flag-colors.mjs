import assert from 'node:assert/strict';

// ── Setup: localStorage mock ─────────────────────────────────────────────────
const storage = new Map();
let getItemCalls = 0;
globalThis.localStorage = {
  getItem: (k) => { getItemCalls += 1; return storage.get(k) ?? null; },
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  FLAG_COLORS, FLAG_COLOR_KEYS, getFlagColor, setFlagColor,
  setFlagColorsBulk, getAllFlags, countFlagColors, clearAllFlags,
  removeFlagColorsBulk, __resetFlagColorCache,
} = await import('../src/lib/flagColors.js');

const EMAIL = 'u@example.com';
const KEY = `flag_colors_v3_${EMAIL}`;   // key v3 (folder-scoped, sekarang)
const KEY_V2 = `flag_colors_v2_${EMAIL}`; // key v2 (flat, legacy)
const KEY_V1 = `flag_colors_${EMAIL}`;   // key v1 (legacy)

// ── Operasi normal (folder default: folderINBOX) ─────────────────────────────
storage.clear();
__resetFlagColorCache();
assert.equal(getFlagColor(EMAIL, '1'), null);
setFlagColor(EMAIL, '1', 'red');
assert.equal(getFlagColor(EMAIL, '1'), 'red');
assert.equal(getFlagColor(EMAIL, '1', 'folderINBOX'), 'red');
setFlagColorsBulk(EMAIL, { '2': 'blue', '3': 'green' });
assert.deepEqual(countFlagColors(EMAIL), { red: 1, yellow: 0, green: 1, blue: 1, purple: 0 });
assert.equal(getAllFlags(EMAIL)['2'], 'blue');
assert.deepEqual(Object.keys(FLAG_COLORS), FLAG_COLOR_KEYS);

// Bentuk store v3: { folderId: { uid: color } }
const storedShape = JSON.parse(storage.get(KEY));
assert.deepEqual(storedShape, { folderINBOX: { '1': 'red', '2': 'blue', '3': 'green' } },
  'store harus folder-scoped di bawah key v3');

// ── FOLDER ISOLATION: uid sama di folder beda = entri berbeda ────────────────
// (regresi inti: uid SOGo per-folder & bisa dipakai ulang — warna tidak boleh
//  bocor lintas folder walau purge terlewat)
storage.clear();
__resetFlagColorCache();
setFlagColor(EMAIL, '5', 'red', 'folderJunk');
assert.equal(getFlagColor(EMAIL, '5', 'folderJunk'), 'red');
assert.equal(getFlagColor(EMAIL, '5', 'folderINBOX'), null,
  'uid sama di folder lain TIDAK boleh mewarisi warna');
assert.deepEqual(getAllFlags(EMAIL, 'folderINBOX'), {});
setFlagColor(EMAIL, '5', 'blue', 'folderINBOX');
assert.equal(getFlagColor(EMAIL, '5'), 'blue');
assert.equal(getFlagColor(EMAIL, '5', 'folderJunk'), 'red');
setFlagColorsBulk(EMAIL, { '9': 'green' }, 'folderJunk');
assert.equal(getFlagColor(EMAIL, '9', 'folderJunk'), 'green');
assert.equal(getFlagColor(EMAIL, '9'), null);

// ── Purge folder-scoped (dipanggil move/delete/junk) ─────────────────────────
storage.clear();
__resetFlagColorCache();
setFlagColor(EMAIL, '1', 'red', 'folderINBOX');
setFlagColor(EMAIL, '2', 'blue', 'folderINBOX');
setFlagColor(EMAIL, '1', 'purple', 'folderJunk');
assert.equal(removeFlagColorsBulk(EMAIL, ['1', '2'], 'folderINBOX'), 2);
assert.equal(getFlagColor(EMAIL, '1'), null);
assert.equal(getFlagColor(EMAIL, '2'), null);
assert.equal(getFlagColor(EMAIL, '1', 'folderJunk'), 'purple',
  'purge di folder asal tidak boleh menyentuh folder lain');
// Folder yang jadi kosong dihapus dari store (tanpa entri yatim kosong).
assert.deepEqual(JSON.parse(storage.get(KEY)), { folderJunk: { '1': 'purple' } });
assert.equal(removeFlagColorsBulk(EMAIL, ['x'], 'folderTidakAda'), 0);
assert.equal(removeFlagColorsBulk(EMAIL, [], 'folderINBOX'), 0);

// Folder default purge = folderINBOX (kompatibilitas pemanggil lama)
storage.clear();
__resetFlagColorCache();
setFlagColor(EMAIL, '7', 'red');
assert.equal(removeFlagColorsBulk(EMAIL, ['7']), 1);
assert.deepEqual(getAllFlags(EMAIL), {});

// ── CACHE: getFlagColor per-baris tidak boleh baca ulang localStorage ────────
storage.clear();
__resetFlagColorCache();
setFlagColor(EMAIL, '1', 'red'); // tulis → cache di-invalidate
getFlagColor(EMAIL, '1');        // 1x baca utk repopulate cache
getItemCalls = 0;
assert.equal(getFlagColor(EMAIL, '1'), 'red');
assert.equal(getFlagColor(EMAIL, '1', 'folderJunk'), null);
assert.equal(getFlagColor(EMAIL, '1'), 'red');
assert.equal(getItemCalls, 0, 'getFlagColor beruntun TIDAK baca localStorage lagi');

// ── Migrasi v2 → v3: flat { uid: color } → { folderINBOX: {...} } ────────────
storage.clear();
__resetFlagColorCache();
storage.set(KEY_V2, JSON.stringify({ '7': 'red', '8': 'bogus-color' }));
assert.deepEqual(getAllFlags(EMAIL), { '7': 'red' }, 'data v2 tetap terbaca (folderINBOX)');
assert.equal(storage.get(KEY), '{"folderINBOX":{"7":"red"}}', 'data v2 dipindah ke key v3 folder-scoped');
assert.ok(storage.get(KEY_V2) == null, 'key v2 dihapus setelah migrasi sukses');
assert.equal(getFlagColor(EMAIL, '7', 'folderJunk'), null);

// ── Migrasi v1 (legacy tanpa versi) → v3 ─────────────────────────────────────
storage.clear();
__resetFlagColorCache();
storage.set(KEY_V1, JSON.stringify({ '9': 'yellow', '10': null, '11': 123, '12': 'orange' }));
assert.deepEqual(getAllFlags(EMAIL), { '9': 'yellow' },
  'data v1 dibaca, warna tidak dikenal & nilai rusak dibuang');
assert.equal(storage.get(KEY), '{"folderINBOX":{"9":"yellow"}}');
assert.ok(storage.get(KEY_V1) == null, 'key v1 legacy dihapus setelah migrasi');

// Idempotent: baca kedua tidak menulis ulang
const rawAfter = storage.get(KEY);
__resetFlagColorCache();
assert.deepEqual(getAllFlags(EMAIL), { '9': 'yellow' });
assert.equal(storage.get(KEY), rawAfter, 'tidak boleh ada penulisan ulang saat sudah bersih');

// ── Bentuk rusak → {} + storage dibersihkan sekali ───────────────────────────
__resetFlagColorCache();
storage.set(KEY, 'null');
assert.deepEqual(getAllFlags(EMAIL), {});
__resetFlagColorCache();
storage.set(KEY, JSON.stringify([1, 2]));
assert.deepEqual(getAllFlags(EMAIL), {});
assert.equal(storage.get(KEY), '{}', 'storage bentuk array ditulis ulang jadi {}');
__resetFlagColorCache();
storage.set(KEY, '"string"');
assert.deepEqual(getAllFlags(EMAIL), {});
assert.equal(storage.get(KEY), '{}', 'storage bentuk string ditulis ulang jadi {}');

// v3 nested rusak (folder map bukan object) dibuang saat normalisasi
__resetFlagColorCache();
storage.set(KEY, JSON.stringify({ folderJunk: 'rusak', folderINBOX: { '3': 'green' } }));
assert.deepEqual(getAllFlags(EMAIL), { '3': 'green' });
assert.equal(getFlagColor(EMAIL, '3', 'folderJunk'), null);

// Data VALID tidak boleh ditulis ulang
__resetFlagColorCache();
const validRaw = JSON.stringify({ folderINBOX: { '9': 'yellow' }, folderJunk: { '4': 'blue' } });
storage.set(KEY, validRaw);
assert.deepEqual(getAllFlags(EMAIL), { '9': 'yellow' });
assert.deepEqual(getAllFlags(EMAIL, 'folderJunk'), { '4': 'blue' });
assert.equal(storage.get(KEY), validRaw, 'data valid harus dibiarkan apa adanya');

// ── clearAllFlags menghapus SEMUA folder + key legacy ────────────────────────
storage.clear();
__resetFlagColorCache();
setFlagColor(EMAIL, '1', 'red', 'folderINBOX');
setFlagColor(EMAIL, '2', 'blue', 'folderJunk');
clearAllFlags(EMAIL);
assert.deepEqual(getAllFlags(EMAIL, 'folderINBOX'), {});
assert.deepEqual(getAllFlags(EMAIL, 'folderJunk'), {});
assert.ok(storage.get(KEY) == null);

console.log('flagColors v3 (folder-scoped) assertions passed');
