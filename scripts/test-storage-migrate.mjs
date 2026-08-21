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

const { readJSON, writeJSON, writeIfChanged } = await import('../src/lib/storageMigrate.js');

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

console.log('storageMigrate assertions passed');
