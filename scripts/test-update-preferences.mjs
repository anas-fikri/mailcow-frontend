// updatePreferences: read-modify-write SEGAR — tidak pernah menulis payload
// dari snapshot fallback (dulu menghapus Vacation/Forward/Sieve/signature).
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || new EventTarget();
globalThis.document = globalThis.document || { cookie: '' };
const api = await import('../src/lib/api.js');

const fullDefaults = () => Object.fromEntries([
  ['SOGoTimeZone', 'Asia/Jakarta'], ['SOGoLanguage', 'Indonesian'], ['Vacation', { enabled: 1, autoReplyText: 'Cuti' }],
  ['Forward', { enabled: 1, forwardAddress: ['x@y.z'] }], ['SOGoSieveFilters', [{ name: 'r1' }]],
  ['PCPWebmailSignatures', { v: 1, list: [], defaults: {}, updatedAt: 5 }], ['SOGoMailSignature', 'S'],
  ['SOGoDateFormat', '%d'], ['SOGoFirstDayOfWeek', 1], ['SOGoConfirmDelete', 1], ['SOGoMailReplyPlacement', 'above'],
]);

let prefsResponse;
let posts;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('/api/preferences')) return prefsResponse();
  if (u.includes('/Preferences/save')) {
    posts.push(JSON.parse(opts.body));
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) };
  }
  throw new Error('unexpected ' + u);
};
const json = (status, body) => () => ({ ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body });

// 1) Baca segar gagal (500) → throw, TIDAK ada POST.
posts = [];
prefsResponse = json(500, {});
await assert.rejects(() => api.updatePreferences('tok', 'u@x.test', () => ({ SOGoTimeZone: 'UTC' })));
assert.equal(posts.length, 0, 'baca gagal → tidak menulis');

// 2) Hasil mencurigakan (< 10 key) → throw, TIDAK ada POST.
posts = [];
prefsResponse = json(200, { defaults: { SOGoTimeZone: 'Asia/Jakarta' }, settings: {} });
await assert.rejects(() => api.updatePreferences('tok', 'u@x.test', () => ({ SOGoTimeZone: 'UTC' })), /tidak lengkap/);
assert.equal(posts.length, 0, '< 10 key → tidak menulis');

// 3) Sukses → hanya key patch berubah; key lain dari server utuh; settings tidak dikirim.
posts = [];
prefsResponse = json(200, { defaults: fullDefaults(), settings: { Mail: { x: 1 } } });
await api.updatePreferences('tok', 'u@x.test', (fresh) => ({
  SOGoTimeZone: 'UTC',
  Vacation: { ...fresh.Vacation, enabled: 0 },
}));
assert.equal(posts.length, 1);
const body = posts[0];
assert.ok(!('settings' in body), 'settings tidak dikirim (SOGo tidak menyentuhnya)');
assert.equal(body.defaults.SOGoTimeZone, 'UTC');
assert.equal(body.defaults.Vacation.enabled, 0);
assert.equal(body.defaults.Vacation.autoReplyText, 'Cuti', 'patch dibangun dari Vacation server');
assert.deepEqual(body.defaults.Forward, fullDefaults().Forward, 'Forward utuh');
assert.deepEqual(body.defaults.SOGoSieveFilters, [{ name: 'r1' }], 'aturan Sieve utuh');
assert.equal(body.defaults.SOGoMailSignature, 'S', 'signature utuh');

console.log('✅ test-update-preferences: semua lolos');
