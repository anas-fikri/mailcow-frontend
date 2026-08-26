import assert from 'node:assert/strict';

// Mock localStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { getRules, addRule, matchRules, executeRules } = await import('../src/lib/autoArchive.js');

const EMAIL = 'u@example.com';
const KEY = `auto_archive_rules_v2_${EMAIL}`;  // key v2 (sekarang)
const KEY_V1 = `auto_archive_rules_${EMAIL}`; // key v1 (legacy)

// ── Empty / tidak ada data ────────────────────────────────────────────────────
assert.deepEqual(getRules(EMAIL), []);
assert.deepEqual(getRules(''), []);
assert.deepEqual(getRules(null), []);

// ── Normalisasi data legacy/rusak (pola loadSignatures) ─────────────────────
// Data legacy ditaruh di KEY v1 — harus terbaca, dinormalisasi, dipindah ke v2.
storage.set(KEY_V1, JSON.stringify([
  null,                                    // dibuang
  'bukan-rule',                            // dibuang
  { id: 42, name: 'IdAngka' },             // id non-string → dibuang
  {                                        // rule valid tapi field tidak lengkap
    id: 'r1',
    conditions: [
      { field: 'from', operator: 'contains', value: 12345 },     // value number → string
      { field: 'subject', operator: 'contains', value: null },   // null → ''
      'bukan-condition',                                         // dibuang
      { field: 'to', operator: 'equals' },                       // value missing → ''
    ],
  },
  {                                        // rule dengan nilai string normal
    id: 'r2',
    name: 'Marketing',
    enabled: true,
    conditions: [{ field: 'subject', operator: 'contains', value: 'promo' }],
    matchType: 'all',
    actionFolder: 'folderINBOX%2FProyek',
    runCount: 3,
    lastRunAt: 1700000000000,
  },
  { id: 'r3', name: 'Nonaktif', enabled: false },               // tanpa conditions/actionFolder
]));

const rules = getRules(EMAIL);
assert.equal(rules.length, 3, 'hanya 3 rule valid yg tersisa');
assert.equal(rules[0].id, 'r1');
assert.equal(rules[0].name, 'Aturan Baru', 'name hilang → default');
assert.equal(rules[0].enabled, true, 'enabled default true saat field hilang');
assert.equal(rules[0].matchType, 'all', 'matchType default all');
assert.equal(rules[0].conditions.length, 3, 'condition non-object dibuang, sisanya dinormalisasi');
assert.equal(rules[0].conditions[0].value, '12345', 'value number di-coerce ke string');
assert.equal(rules[0].conditions[1].value, '', 'value null → string kosong');
assert.equal(rules[0].conditions[2].value, '', 'value missing → string kosong');
assert.equal(rules[0].conditions[0].operator, 'contains');
assert.equal(rules[0].conditions[2].field, 'to');
assert.equal(rules[0].actionFolder, '', 'actionFolder missing → string kosong');
assert.equal(rules[0].runCount, 0);
assert.equal(rules[0].lastRunAt, null);

assert.equal(rules[1].name, 'Marketing');
assert.equal(rules[1].runCount, 3);
assert.equal(rules[1].lastRunAt, 1700000000000);
assert.equal(rules[2].enabled, false);

// ── Write-back SEKALI-JALAN: hasil normalisasi dipersist ke key v2 ──────────
const storedRules = JSON.parse(storage.get(KEY));
assert.equal(storedRules.length, 3, 'storage harus berisi aturan ternormalisasi');
assert.equal(storedRules[0].conditions[0].value, '12345', 'value number di-coerce ke string di storage');
assert.equal(storedRules[0].conditions[1].value, '');
assert.ok(storage.get(KEY_V1) == null, 'key v1 legacy harus dihapus setelah migrasi');
// Idempotent: baca kedua tidak menulis ulang (storage sudah bentuk valid)
const rawAfter = storage.get(KEY);
assert.equal(getRules(EMAIL).length, 3);
assert.equal(storage.get(KEY), rawAfter, 'tidak boleh ada penulisan ulang saat sudah ternormalisasi');

// ── matchRules aman dgn rule legacy (value sudah string) ─────────────────────
const msg = { from: 'boss@corp.test', to: 'u@example.com', subject: 'promo besar', date: 'x', isRead: true, hasAtt: false, isFlagged: false, uid: '99' };
const matched = matchRules(EMAIL, msg);
assert.ok(matched.includes('r2'), 'rule r2 harus match subject promo');
assert.ok(!matched.includes('r1'), 'rule r1 (from=12345, to=equals \'\') tidak match');
assert.ok(!matched.includes('r3'), 'rule r3 disabled tidak match');

// ── JSON non-array → [] (bukan crash) + storage dibersihkan sekali ───────────
storage.set(KEY, '{}');
assert.deepEqual(getRules(EMAIL), []);
assert.equal(storage.get(KEY), '[]', 'storage bentuk rusak ditulis ulang jadi []');
storage.set(KEY, 'null');
assert.deepEqual(getRules(EMAIL), []);
storage.set(KEY, '"string"');
assert.deepEqual(getRules(EMAIL), []);
storage.set(KEY, '[1,2,3]');
assert.deepEqual(getRules(EMAIL), [], 'array angka → [] tanpa crash');

// ── addRule tetap menghasilkan data yg bisa dibaca ulang tanpa berubah bentuk ─
storage.clear();
const added = addRule(EMAIL, { name: 'Baru', conditions: [{ field: 'from', operator: 'contains', value: 'x' }] });
const reloaded = getRules(EMAIL);
assert.equal(reloaded.length, 1);
assert.deepEqual(reloaded[0], {
  id: added.id,
  name: 'Baru',
  enabled: true,
  conditions: [{ field: 'from', operator: 'contains', value: 'x' }],
  matchType: 'all',
  actionFolder: 'folderTrash', // default addRule
  createdAt: added.createdAt,
  runCount: 0,
  lastRunAt: null,
});

// ── INTERAKSI: pesan yang di-snooze TIDAK dipindah oleh executeRules ────────
// Rule r2 match subject 'promo' → ke folderINBOX%2FProyek. Bila pesan sedang
// di-snooze (user minta tunda), rule TIDAK boleh memindahkannya — memindahnya
// membuat snooze yatim (uid berubah) + mengabaikan keinginan user.
storage.clear();
addRule(EMAIL, {
  name: 'Promo → Proyek',
  conditions: [{ field: 'subject', operator: 'contains', value: 'promo' }],
  actionFolder: 'folderINBOX%2FProyek',
});

const snoozedMsg = { uid: 101, from: 'boss@corp.test', to: 'u@example.com', subject: 'promo besar', date: 'x' };
const normalMsg  = { uid: 102, from: 'boss@corp.test', to: 'u@example.com', subject: 'promo jumbo', date: 'x' };
const movedByRules = [];

// Tanpa isExcluded → kedua pesan dipindah (perilaku lama).
let actions = await executeRules(EMAIL, 'token', 'folderINBOX', [snoozedMsg, normalMsg],
  (uids) => { movedByRules.push(...uids); return Promise.resolve(); });
assert.equal(actions.length, 1);
assert.deepEqual(movedByRules.sort((a, b) => a - b), [101, 102]);

// Dengan isExcluded (snoozedUids) → pesan snooze TIDAK ikut dipindah.
movedByRules.length = 0;
actions = await executeRules(EMAIL, 'token', 'folderINBOX', [snoozedMsg, normalMsg],
  (uids) => { movedByRules.push(...uids); return Promise.resolve(); },
  (m) => m.uid === 101 // uid 101 sedang di-snooze
);
assert.equal(actions.length, 1, 'rule tetap jalan utk pesan lain');
assert.deepEqual(movedByRules, [102], 'hanya pesan non-snooze yang dipindah');

// Semua pesan di-snooze → tidak ada aksi sama sekali.
movedByRules.length = 0;
actions = await executeRules(EMAIL, 'token', 'folderINBOX', [snoozedMsg, normalMsg],
  (uids) => { movedByRules.push(...uids); return Promise.resolve(); },
  () => true
);
assert.equal(actions.length, 0);
assert.deepEqual(movedByRules, []);

console.log('autoArchive assertions passed');
