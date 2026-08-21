import assert from 'node:assert/strict';

// Mock localStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { getRules, addRule, matchRules } = await import('../src/lib/autoArchive.js');

const EMAIL = 'u@example.com';
const KEY = `auto_archive_rules_${EMAIL}`;

// ── Empty / tidak ada data ────────────────────────────────────────────────────
assert.deepEqual(getRules(EMAIL), []);
assert.deepEqual(getRules(''), []);
assert.deepEqual(getRules(null), []);

// ── Normalisasi data legacy/rusak (pola loadSignatures) ─────────────────────
storage.set(KEY, JSON.stringify([
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

// ── matchRules aman dgn rule legacy (value sudah string) ─────────────────────
const msg = { from: 'boss@corp.test', to: 'u@example.com', subject: 'promo besar', date: 'x', isRead: true, hasAtt: false, isFlagged: false, uid: '99' };
const matched = matchRules(EMAIL, msg);
assert.ok(matched.includes('r2'), 'rule r2 harus match subject promo');
assert.ok(!matched.includes('r1'), 'rule r1 (from=12345, to=equals \'\') tidak match');
assert.ok(!matched.includes('r3'), 'rule r3 disabled tidak match');

// ── JSON non-array → [] (bukan crash) ────────────────────────────────────────
storage.set(KEY, '{}');
assert.deepEqual(getRules(EMAIL), []);
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

console.log('autoArchive assertions passed');
