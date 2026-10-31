import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  SNOOZE_PRESETS, loadSnoozes, snoozeMessage, unsnoozeMessage, unsnoozeMessages, isSnoozed, pruneExpired,
} = await import('../src/lib/snooze.js');

const now = Math.floor(Date.now() / 1000);

// Nothing snoozed initially
assert.deepEqual(loadSnoozes('u@example.com'), {});
assert.equal(isSnoozed('u@example.com', 'folderINBOX', '42', now), false);

// ── Snooze FOLDER-SCOPED (schema v3) ────────────────────────────────────────
// Email dinormalisasi; uid disimpan per folder; uid di folder lain TIDAK ikut.
snoozeMessage(' U@Example.COM ', 'folderINBOX', 42, now + 3600);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 42, now), true);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 43, now), false);
// Pesan di folder lain dengan uid SAMA tidak tersembunyi (root cause fix).
assert.equal(isSnoozed('u@example.com', 'folderArchive', 42, now), false, 'snooze inbox tidak boleh berlaku di folder lain');

// Unsnooze per folder
unsnoozeMessage('u@example.com', 'folderINBOX', 42);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 42, now), false);

// ── pruneExpired (semua folder) ──────────────────────────────────────────────
snoozeMessage('u@example.com', 'folderINBOX', 1, now - 10); // expired
snoozeMessage('u@example.com', 'folderINBOX', 2, now + 10); // future
snoozeMessage('u@example.com', 'folderArchive', 3, now - 5); // expired di folder lain
assert.equal(pruneExpired('u@example.com', now), 1); // hanya folderINBOX (folderArchive entri habis → folder dihapus)
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 1, now), false);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 2, now), true);

// ── Presets sanity ───────────────────────────────────────────────────────────
assert.equal(SNOOZE_PRESETS.length, 4);
assert.ok(SNOOZE_PRESETS.every((p) => p.hours > 0));

// ── unsnoozeMessages: hapus entri yatim saat move/delete ────────────────────
snoozeMessage('u@example.com', 'folderINBOX', 77, now + 3600);
snoozeMessage('u@example.com', 'folderINBOX', 88, now + 3600);
// Hanya uid 77 yang dipindah → hanya 77 dihapus.
assert.equal(unsnoozeMessages('u@example.com', 'folderINBOX', [77]), 1);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 77, now), false);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', 88, now), true, 'uid lain tidak ikut terhapus');
// uid yang tidak ada → 0
assert.equal(unsnoozeMessages('u@example.com', 'folderINBOX', [999]), 0);
// folder lain tidak tersentuh
assert.equal(unsnoozeMessages('u@example.com', 'folderArchive', [77]), 0);

// ── Migrasi v2 legacy (flat {uid: wakeEpoch}) → v3 (folderINBOX) ────────────
storage.clear();
storage.set('pcp_snooze_v2_u@example.com', JSON.stringify({
  '1': '123456',   // string → number
  '2': null,       // dibuang
  '3': 'abc',      // NaN → dibuang
  '4': 555,        // number dipertahankan
  '5': true,       // dibuang
}));
const norm = loadSnoozes('u@example.com');
// Data v2 flat dimigrasi ke folderINBOX.
assert.deepEqual(norm.folderINBOX, { '1': 123456, '4': 555 });
assert.equal(isSnoozed('u@example.com', 'folderINBOX', '1', 123450), true, 'string epoch dinormalisasi ke number');
assert.equal(isSnoozed('u@example.com', 'folderINBOX', '2', 0), false);
assert.equal(isSnoozed('u@example.com', 'folderINBOX', '5', 0), false);
// Key v2 dihapus + data dipersist ke v3.
assert.ok(storage.get('pcp_snooze_v2_u@example.com') == null, 'key v2 legacy harus dihapus setelah migrasi');
const storedV3 = JSON.parse(storage.get('pcp_snooze_v3_u@example.com'));
assert.deepEqual(storedV3, { folderINBOX: { '1': 123456, '4': 555 } }, 'storage v3 harus berisi folderINBOX ternormalisasi');
// Idempotent: baca kedua tidak mengubah apa pun.
const rawAfter = storage.get('pcp_snooze_v3_u@example.com');
assert.deepEqual(loadSnoozes('u@example.com'), { folderINBOX: { '1': 123456, '4': 555 } });
assert.equal(storage.get('pcp_snooze_v3_u@example.com'), rawAfter, 'tidak boleh ada penulisan ulang saat sudah bersih');

// ── Normalisasi bentuk rusak v3 ──────────────────────────────────────────────
// JSON "null" = tidak ada data (tanpa tulis)
storage.set('pcp_snooze_v3_u@example.com', 'null');
assert.deepEqual(loadSnoozes('u@example.com'), {});
// array / string (bentuk rusak yang bisa di-parse) → {} + storage dibersihkan.
storage.set('pcp_snooze_v3_u@example.com', JSON.stringify([1, 2]));
assert.deepEqual(loadSnoozes('u@example.com'), {});
assert.equal(storage.get('pcp_snooze_v3_u@example.com'), '{}', 'storage bentuk array ditulis ulang jadi {}');
storage.set('pcp_snooze_v3_u@example.com', '"string"');
assert.deepEqual(loadSnoozes('u@example.com'), {});
assert.equal(storage.get('pcp_snooze_v3_u@example.com'), '{}', 'storage bentuk string ditulis ulang jadi {}');
// map folder rusak (bukan object) dibuang, folder valid dipertahankan.
storage.set('pcp_snooze_v3_u@example.com', JSON.stringify({
  folderINBOX: [1, 2],
  folderArchive: { '9': 123456 },
}));
const mixed = loadSnoozes('u@example.com');
assert.deepEqual(mixed.folderArchive, { '9': 123456 });
assert.ok(!('folderINBOX' in mixed), 'folder berbentuk array dibuang');

console.log('snooze assertions passed');
