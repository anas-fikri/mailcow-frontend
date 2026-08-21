import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  FLAG_COLORS, FLAG_COLOR_KEYS, getFlagColor, setFlagColor,
  setFlagColorsBulk, getAllFlags, countFlagColors, clearAllFlags,
} = await import('../src/lib/flagColors.js');

const EMAIL = 'u@example.com';
const KEY = `flag_colors_${EMAIL}`;

// ── Operasi normal ────────────────────────────────────────────────────────────
assert.equal(getFlagColor(EMAIL, '1'), null);
setFlagColor(EMAIL, '1', 'red');
assert.equal(getFlagColor(EMAIL, '1'), 'red');
setFlagColorsBulk(EMAIL, { '2': 'blue', '3': 'green' });
assert.deepEqual(countFlagColors(EMAIL), { red: 1, yellow: 0, green: 1, blue: 1, purple: 0 });
assert.equal(getAllFlags(EMAIL)['2'], 'blue');
clearAllFlags(EMAIL);
assert.deepEqual(getAllFlags(EMAIL), {});
assert.deepEqual(Object.keys(FLAG_COLORS), FLAG_COLOR_KEYS);

// ── Migrasi SEKALI-JALAN: prune warna yang tidak dikenal ─────────────────────
// Simulasikan storage lama dgn warna yang sudah tidak ada (mis. "orange") +
// nilai rusak (null, angka) — harus dibuang dan ditulis balik.
storage.set(KEY, JSON.stringify({
  '1': 'red',
  '2': 'orange',      // warna legacy yang sudah tidak dikenal → dibuang
  '3': null,          // rusak → dibuang
  '4': 123,           // rusak → dibuang
  '5': 'purple',
}));
const flags = getAllFlags(EMAIL);
assert.deepEqual(flags, { '1': 'red', '5': 'purple' }, 'hanya warna valid yg tersisa');
assert.equal(getFlagColor(EMAIL, '2'), null);
assert.equal(getFlagColor(EMAIL, '4'), null);

// Write-back: storage sudah bersih
const stored = JSON.parse(storage.get(KEY));
assert.deepEqual(stored, { '1': 'red', '5': 'purple' }, 'storage harus ditulis ulang tanpa warna invalid');

// Idempotent: baca kedua tidak menulis ulang
const rawAfter = storage.get(KEY);
assert.deepEqual(getAllFlags(EMAIL), { '1': 'red', '5': 'purple' });
assert.equal(storage.get(KEY), rawAfter, 'tidak boleh ada penulisan ulang saat sudah bersih');

// ── Bentuk rusak → {} + storage dibersihkan sekali ───────────────────────────
// JSON "null" = tidak ada data (tanpa tulis); array/string bisa di-parse → {} + write.
storage.set(KEY, 'null');
assert.deepEqual(getAllFlags(EMAIL), {});
storage.set(KEY, JSON.stringify([1, 2]));
assert.deepEqual(getAllFlags(EMAIL), {});
assert.equal(storage.get(KEY), '{}', 'storage bentuk array ditulis ulang jadi {}');
storage.set(KEY, '"string"');
assert.deepEqual(getAllFlags(EMAIL), {});
assert.equal(storage.get(KEY), '{}', 'storage bentuk string ditulis ulang jadi {}');

// Data VALID tidak boleh ditulis ulang
const validRaw = JSON.stringify({ '9': 'yellow' });
storage.set(KEY, validRaw);
assert.deepEqual(getAllFlags(EMAIL), { '9': 'yellow' });
assert.equal(storage.get(KEY), validRaw, 'data valid harus dibiarkan apa adanya');

console.log('flagColors assertions passed');
