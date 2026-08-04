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

console.log('userPrefs assertions passed');
