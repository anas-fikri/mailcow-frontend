import assert from 'node:assert/strict';

// Mock localStorage dengan Map + mode gagal utk uji try/catch.
const storage = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => {
    if (failWrites) throw new Error('QuotaExceededError (mock)');
    storage.set(k, String(v));
  },
  removeItem: (k) => storage.delete(k),
};

const {
  readJSON, writeJSON, removeJSON, writeIfChanged,
  storageKey, readStorage, persistNormalized, STORAGE_VERSION,
} = await import('../src/lib/storageMigrate.js');

// ── readJSON ─────────────────────────────────────────────────────────────────
assert.equal(readJSON('missing'), null, 'key tidak ada → null');
storage.set('ok', '{"a":1,"b":[2,3]}');
assert.deepEqual(readJSON('ok'), { a: 1, b: [2, 3] });
storage.set('bad', '{rusak');
assert.equal(readJSON('bad'), null, 'JSON rusak → null (tidak throw)');
storage.set('empty', '');
assert.equal(readJSON('empty'), null, 'string kosong → null (JSON.parse throw → null)');
storage.set('null-json', 'null');
assert.equal(readJSON('null-json'), null, 'JSON "null" → null');
storage.set('array', '[1,2]');
assert.deepEqual(readJSON('array'), [1, 2], 'JSON array tetap dikembalikan (bentuk divalidasi pemakai)');

// ── writeJSON ────────────────────────────────────────────────────────────────
storage.delete('w');
assert.equal(writeJSON('w', { a: 1 }), true);
assert.equal(storage.get('w'), '{"a":1}');
assert.equal(writeJSON('w', [1, 2]), true);
assert.equal(storage.get('w'), '[1,2]');
failWrites = true;
assert.equal(writeJSON('w', { x: 1 }), false, 'setItem gagal → false, tidak throw');
failWrites = false;

// ── writeIfChanged ───────────────────────────────────────────────────────────
storage.set('c', JSON.stringify({ v: 1 }));
assert.equal(writeIfChanged('c', { v: 1 }, { v: 1 }), false, 'sama → tidak menulis');
assert.equal(storage.get('c'), '{"v":1}');
assert.equal(writeIfChanged('c', { v: 1 }, { v: 2 }), true, 'beda → menulis');
assert.equal(storage.get('c'), '{"v":2}');
// Key order berbeda dianggap beda → ditulis sekali (lalu idempotent saat baca
// berikutnya mengambil original DARI storage yang sudah ternormalisasi).
assert.equal(writeIfChanged('c', { a: 1, b: 2 }, { b: 2, a: 1 }), true);
const storedNext = JSON.parse(storage.get('c')); // simulasi baca berikutnya
assert.equal(writeIfChanged('c', storedNext, { b: 2, a: 1 }), false, 'setelah ditulis ulang → idempotent');
failWrites = true;
assert.equal(writeIfChanged('c', { a: 1 }, { a: 2 }), false, 'setItem gagal → false, tidak throw');
failWrites = false;

// ── storageKey ───────────────────────────────────────────────────────────────
assert.equal(storageKey('pcp_x', 'u@x.com'), 'pcp_x_v2_u@x.com');
assert.equal(storageKey('pcp_x', 'u@x.com', 2), 'pcp_x_v2_u@x.com');
assert.equal(storageKey('pcp_x', 'u@x.com', 1), 'pcp_x_u@x.com', 'v1 tanpa suffix _v1');
assert.equal(storageKey('pcp_x'), 'pcp_x_v2', 'tanpa scope');
assert.equal(STORAGE_VERSION, 2);

// ── removeJSON ───────────────────────────────────────────────────────────────
storage.set('rm', 'x');
assert.equal(removeJSON('rm'), true);
assert.equal(storage.get('rm'), undefined);
assert.equal(removeJSON('missing'), true, 'remove key yang tidak ada = true');

// ── readStorage (fallback chain v2 → v1) ────────────────────────────────────
storage.clear();
// Tidak ada data sama sekali
assert.deepEqual(readStorage('pcp_demo', 'u@x.com'),
  { value: null, key: 'pcp_demo_v2_u@x.com', version: 0, fromLegacy: false });
// Data di v1 (legacy)
storage.set('pcp_demo_u@x.com', '{"v":1}');
assert.deepEqual(readStorage('pcp_demo', 'u@x.com'),
  { value: { v: 1 }, key: 'pcp_demo_v2_u@x.com', version: 1, fromLegacy: true });
// v2 menang atas v1 (versi tertinggi dulu)
storage.set('pcp_demo_v2_u@x.com', '{"v":2}');
assert.deepEqual(readStorage('pcp_demo', 'u@x.com'),
  { value: { v: 2 }, key: 'pcp_demo_v2_u@x.com', version: 2, fromLegacy: false });
// JSON 'null' tersimpan di v2 = "tidak ada" → fallback ke v1
storage.set('pcp_demo_v2_u@x.com', 'null');
assert.deepEqual(readStorage('pcp_demo', 'u@x.com'),
  { value: { v: 1 }, key: 'pcp_demo_v2_u@x.com', version: 1, fromLegacy: true });

// ── persistNormalized ────────────────────────────────────────────────────────
storage.clear();
// Data dari v1 → tulis ke v2 + hapus v1 (sekali jalan)
storage.set('pcp_demo_u@x.com', '{"v":1,"extra":true}');
const info1 = readStorage('pcp_demo', 'u@x.com');
assert.equal(persistNormalized('pcp_demo', 'u@x.com', info1.value, { v: 1 }, info1), true);
assert.equal(storage.get('pcp_demo_v2_u@x.com'), '{"v":1}', 'hasil ternormalisasi ditulis ke v2');
assert.ok(storage.get('pcp_demo_u@x.com') == null, 'key v1 legacy dihapus');

// Data sudah di v2 & bentuk sama → tidak menulis (idempotent)
const info2 = readStorage('pcp_demo', 'u@x.com');
assert.equal(persistNormalized('pcp_demo', 'u@x.com', info2.value, { v: 1 }, info2), false);
assert.equal(storage.get('pcp_demo_v2_u@x.com'), '{"v":1}', 'tidak ada penulisan ulang saat sudah ternormalisasi');

// Bentuk beda di v2 → writeIfChanged menulis
const info3 = readStorage('pcp_demo', 'u@x.com');
assert.equal(persistNormalized('pcp_demo', 'u@x.com', info3.value, { v: 9 }, info3), true);
assert.equal(storage.get('pcp_demo_v2_u@x.com'), '{"v":9}');

// Tulis gagal (quota) saat migrasi dari v1 → v1 TIDAK dihapus
storage.clear();
storage.set('pcp_demo_u@x.com', '{"v":1}');
failWrites = true;
const info4 = readStorage('pcp_demo', 'u@x.com');
assert.equal(persistNormalized('pcp_demo', 'u@x.com', info4.value, { v: 1 }, info4), false);
assert.equal(storage.get('pcp_demo_u@x.com'), '{"v":1}', 'key v1 dipertahankan saat tulis ke v2 gagal');
failWrites = false;

console.log('storageMigrate assertions passed');
