import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const { DEFAULT_PREFS, loadPrefs, savePrefs } = await import('../src/lib/userPrefs.js');

assert.equal(loadPrefs('missing@example.com'), null);
savePrefs(' User@Example.com ', { theme: 'light', themeColor: 'violet' });
assert.deepEqual(loadPrefs('user@example.com'), {
  ...DEFAULT_PREFS,
  theme: 'light',
  themeColor: 'violet',
});
assert.equal(loadPrefs('other@example.com'), null);

savePrefs('other@example.com', { theme: 'light' });
assert.equal(loadPrefs('USER@example.com').theme, 'light');
assert.equal(loadPrefs('other@example.com').theme, 'light');
assert.notEqual(loadPrefs('USER@example.com').themeColor, loadPrefs('other@example.com').themeColor);

// ── Write-back SEKALI-JALAN (pola loadSignatures) ────────────────────────────
// Data legacy: field hilang / nilai invalid → normalisasi + dipersist.
storage.set('pcp_prefs_legacy@example.com', JSON.stringify({ theme: 'light' }));
assert.deepEqual(loadPrefs('legacy@example.com'), { ...DEFAULT_PREFS, theme: 'light' });
const storedLegacy = JSON.parse(storage.get('pcp_prefs_legacy@example.com'));
assert.deepEqual(storedLegacy, { ...DEFAULT_PREFS, theme: 'light' }, 'write-back: field hilang diisi default');
// Idempotent: baca kedua tidak menulis ulang
const rawAfter = storage.get('pcp_prefs_legacy@example.com');
assert.deepEqual(loadPrefs('legacy@example.com'), { ...DEFAULT_PREFS, theme: 'light' });
assert.equal(storage.get('pcp_prefs_legacy@example.com'), rawAfter, 'tidak boleh ada penulisan ulang saat sudah ternormalisasi');

// Cache valid tidak boleh ditulis ulang
const validRaw = JSON.stringify({ ...DEFAULT_PREFS, theme: 'dark' });
storage.set('pcp_prefs_valid@example.com', validRaw);
loadPrefs('valid@example.com');
assert.equal(storage.get('pcp_prefs_valid@example.com'), validRaw, 'cache valid harus dibiarkan apa adanya');

// Non-object / array → null (bukan crash), tanpa menulis apa pun
storage.set('pcp_prefs_arr@example.com', JSON.stringify([1, 2]));
assert.equal(loadPrefs('arr@example.com'), null);
assert.equal(storage.get('pcp_prefs_arr@example.com'), JSON.stringify([1, 2]), 'bentuk non-object dibiarkan (return null)');

console.log('userPrefs assertions passed');
