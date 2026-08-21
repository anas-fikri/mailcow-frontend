import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  SNOOZE_PRESETS, loadSnoozes, snoozeMessage, unsnoozeMessage, isSnoozed, pruneExpired,
} = await import('../src/lib/snooze.js');

const now = Math.floor(Date.now() / 1000);

// Nothing snoozed initially
assert.equal(loadSnoozes('u@example.com')['42'], undefined);
assert.equal(isSnoozed('u@example.com', '42', now), false);

// Snooze (email normalized, uid stored as string)
snoozeMessage(' U@Example.COM ', 42, now + 3600);
assert.equal(isSnoozed('u@example.com', 42, now), true);
assert.equal(isSnoozed('u@example.com', 43, now), false);

// Unsnooze
unsnoozeMessage('u@example.com', 42);
assert.equal(isSnoozed('u@example.com', 42, now), false);

// pruneExpired removes past wake times, keeps future
snoozeMessage('u@example.com', 1, now - 10); // expired
snoozeMessage('u@example.com', 2, now + 10); // future
assert.equal(pruneExpired('u@example.com', now), 1); // only uid 2 remains
assert.equal(isSnoozed('u@example.com', 1, now), false);
assert.equal(isSnoozed('u@example.com', 2, now), true);

// Presets sanity
assert.equal(SNOOZE_PRESETS.length, 4);
assert.ok(SNOOZE_PRESETS.every((p) => p.hours > 0));

// ── Normalisasi data legacy/rusak (pola loadSignatures) ─────────────────────
// Nilai non-numerik / tidak finite dibuang; string epoch di-coerce ke number.
storage.set('pcp_snooze_u@example.com', JSON.stringify({
  '1': '123456',   // string → number
  '2': null,       // dibuang
  '3': 'abc',      // NaN → dibuang
  '4': 555,        // number dipertahankan
  '5': true,       // dibuang
}));
const norm = loadSnoozes('u@example.com');
assert.deepEqual(norm, { '1': 123456, '4': 555 });
assert.equal(isSnoozed('u@example.com', '1', 123450), true, 'string epoch dinormalisasi ke number');
assert.equal(isSnoozed('u@example.com', '2', 0), false);
assert.equal(isSnoozed('u@example.com', '5', 0), false);

// ── Write-back SEKALI-JALAN: hasil bersih dipersist ke localStorage ─────────
const storedNorm = JSON.parse(storage.get('pcp_snooze_u@example.com'));
assert.deepEqual(storedNorm, { '1': 123456, '4': 555 }, 'storage harus ditulis ulang dgn nilai numerik saja');
// Idempotent: baca kedua tidak mengubah apa pun (semua nilai sudah number)
const rawAfter = storage.get('pcp_snooze_u@example.com');
assert.deepEqual(loadSnoozes('u@example.com'), { '1': 123456, '4': 555 });
assert.equal(storage.get('pcp_snooze_u@example.com'), rawAfter, 'tidak boleh ada penulisan ulang saat sudah bersih');

// JSON "null" = tidak ada data (tanpa tulis); array / string (bentuk rusak
// yang bisa di-parse) → {} (bukan crash) + storage dibersihkan sekali.
storage.set('pcp_snooze_u@example.com', 'null');
assert.deepEqual(loadSnoozes('u@example.com'), {});
storage.set('pcp_snooze_u@example.com', JSON.stringify([1, 2]));
assert.deepEqual(loadSnoozes('u@example.com'), {});
assert.equal(storage.get('pcp_snooze_u@example.com'), '{}', 'storage bentuk array ditulis ulang jadi {}');
storage.set('pcp_snooze_u@example.com', '"string"');
assert.deepEqual(loadSnoozes('u@example.com'), {});
assert.equal(storage.get('pcp_snooze_u@example.com'), '{}', 'storage bentuk string ditulis ulang jadi {}');

console.log('snooze assertions passed');
