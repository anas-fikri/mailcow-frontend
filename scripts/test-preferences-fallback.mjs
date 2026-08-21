import assert from 'node:assert/strict';

// Regression test: 401/403 dari /api/* (proxy SMTP) TIDAK boleh memicu
// session-expired SOGo.
//
// Latar belakang: setelah reload halaman, smtpToken dulu hanya di memori
// (hilang), sehingga /api/preferences tanpa X-SMTP-Token dibalas 401 oleh
// server. Kode lama memperlakukan 401 itu sebagai "SOGo session expired" →
// force logout + redirect → mailbox kosong. Sekarang /api/* 401/403 harus
// graceful fallback ke localStorage tanpa memicu onSessionExpired.

const api = await import('../src/lib/api.js');

function response(status, data, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : '' },
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data ?? '')),
  };
}

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;

try {
  globalThis.document = { cookie: '' };
  // Di Node tidak ada localStorage global → loadPrefsFromLocal selalu null
  // (try/catch internal). Ini justru memaksa jalur fallback murni.
  globalThis.localStorage = undefined;

  let sessionExpiredFired = 0;
  api.onSessionExpired(() => { sessionExpiredFired++; });

  // ── 1. 401 (sesi SMTP hilang) → resolve null, TIDAK picu session-expired ──
  globalThis.fetch = async () => response(401, { message: 'Sesi SMTP sudah berakhir.' });
  const prefs1 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.equal(prefs1, null, '401 harus resolve (fallback), bukan reject');
  assert.equal(sessionExpiredFired, 0, '401 dari /api/* TIDAK boleh memicu onSessionExpired');

  // ── 2. 403 juga fallback, tanpa session-expired ───────────────────────────
  globalThis.fetch = async () => response(403, { message: 'Forbidden' });
  const prefs2 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.equal(prefs2, null, '403 harus resolve (fallback), bukan reject');
  assert.equal(sessionExpiredFired, 0, '403 dari /api/* TIDAK boleh memicu onSessionExpired');

  // ── 3. 200 valid → data dikembalikan langsung ─────────────────────────────
  const payload = { defaults: { Vacation: { enabled: false } }, settings: {} };
  globalThis.fetch = async () => response(200, payload);
  const prefs3 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.equal(prefs3, payload, '200 harus mengembalikan data preferences');

  // ── 4. Guard: email/token tidak valid → resolve null tanpa fetch ──────────
  let fetchCalled = 0;
  globalThis.fetch = async () => { fetchCalled++; return response(200, payload); };
  const prefs4 = await api.fetchPreferences('', 'user@x.test');
  assert.equal(prefs4, null, 'guard harus skip saat email kosong');
  assert.equal(fetchCalled, 0, 'guard harus mencegah pemanggilan fetch');

  // ── 5. Normalisasi fallback localStorage (pola loadSignatures) ─────────────
  // Cache lokal sogo_prefs_<email> dari versi lama bisa berbentuk apa pun.
  // 401 → fallback ke localStorage → hasil harus { defaults, settings } object.
  const ls = new Map();
  globalThis.localStorage = {
    getItem: (k) => ls.get(k) ?? null,
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: (k) => ls.delete(k),
  };
  globalThis.fetch = async () => response(401, { message: 'Sesi SMTP sudah berakhir.' });

  ls.set('sogo_prefs_user@x.test', JSON.stringify({ defaults: { SOGoTimeZone: 'Asia/Jakarta' }, settings: {} }));
  const prefs5 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.ok(prefs5 && typeof prefs5 === 'object', 'fallback harus mengembalikan object');
  assert.equal(prefs5.defaults.SOGoTimeZone, 'Asia/Jakarta');
  assert.ok(prefs5.settings && typeof prefs5.settings === 'object');

  // Cache berbentuk string/array/null → dinormalisasi jadi { defaults:{}, settings:{} }
  ls.set('sogo_prefs_user@x.test', '"bukan-prefs"');
  const prefs6 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.deepEqual(prefs6, { defaults: {}, settings: {} }, 'cache non-object harus dinormalisasi');
  ls.set('sogo_prefs_user@x.test', 'null');
  const prefs7 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.deepEqual(prefs7, { defaults: {}, settings: {} }, 'JSON null harus dinormalisasi');
  ls.set('sogo_prefs_user@x.test', JSON.stringify([1, 2]));
  const prefs8 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.deepEqual(prefs8, { defaults: {}, settings: {} }, 'array harus dinormalisasi');

  // defaults/settings non-object (string) → dipaksa {} agar akses .SOGo* aman
  ls.set('sogo_prefs_user@x.test', JSON.stringify({ defaults: 'rusak', settings: 42 }));
  const prefs9 = await api.fetchPreferences('token@x.test', 'user@x.test');
  assert.deepEqual(prefs9, { defaults: {}, settings: {} }, 'defaults/settings non-object harus dinormalisasi');

  console.log('preferences fallback assertions passed');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.localStorage = originalLocalStorage;
}
