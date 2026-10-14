// saveSieveFilters/fetchSieveFilters — Vacation/Forward/defaults lain TIDAK
// boleh tertimpa (SOGo saveAction = setValues: defaults → REPLACE penuh),
// `settings` tidak dikirim, fallback localStorage basi tidak dipakai, 502/503
// (Sieve gagal) dilaporkan. + kontrak statis UI aturan server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

function response(status, data, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : '') },
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data ?? '')),
  };
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { cookie: 'XSRF-TOKEN=abc' };
const api = await import('../src/lib/api.js');
const originalFetch = globalThis.fetch;

const serverDefaults = {
  Vacation: { enabled: '1', subject: 'Cuti', text: 'Halo', autoReplyEmailAddresses: ['u@x.test'] },
  Forward: { enabled: 1, forwardAddress: ['f@x.test'], keepCopy: 1 },
  SOGoMailSignature: '<b>sig</b>',
  SOGoSieveFilters: [{ name: 'lama', active: 1, match: 'all', rules: [], actions: [{ method: 'keep' }] }],
};

try {
  // ── 1. Save = defaults segar + hanya SOGoSieveFilters yang diganti ─────────
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).startsWith('/api/preferences')) return response(200, { defaults: serverDefaults, settings: { Mail: { x: 1 } } });
    return response(200, '', 'text/plain');
  };
  let sessionExpired = 0;
  api.onSessionExpired(() => { sessionExpired++; });
  const filters = [{ name: 'baru', active: 1, match: 'all', rules: [{ field: 'cc', operator: 'contains', value: 'nadya' }], actions: [{ method: 'addflag', argument: 'flagged' }, { method: 'stop' }] }];
  await api.saveSieveFilters('u@x.test', 'u@x.test', filters);
  const post = calls.find((c) => c.opts.method === 'POST');
  ok(post && /\/SOGo\/so\/[^/]+\/Preferences\/save$/.test(post.url), 'POST ke Preferences/save');
  const body = JSON.parse(post.opts.body);
  ok(!('settings' in body), 'settings TIDAK dikirim');
  assert.deepEqual(body.defaults.Vacation, serverDefaults.Vacation); n++;
  assert.deepEqual(body.defaults.Forward, serverDefaults.Forward); n++;
  ok(body.defaults.SOGoMailSignature === '<b>sig</b>', 'signature dipertahankan');
  assert.deepEqual(body.defaults.SOGoSieveFilters, filters); n++;
  ok(calls.findIndex((c) => c.url.startsWith('/api/preferences')) < calls.indexOf(post), 'baca segar SEBELUM save (read-modify-write)');
  ok(post.opts.headers['X-XSRF-TOKEN'] === 'abc', 'header XSRF dikirim');
  const cached = JSON.parse(store.get('sogo_prefs_v2_u@x.test'));
  ok(cached.defaults.Vacation.subject === 'Cuti' && cached.settings.Mail.x === 1, 'cache lokal diperbarui tanpa kehilangan settings');

  // ── 2. /api/preferences 401 → throw, TIDAK POST, TIDAK session-expired ────
  calls.length = 0;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return response(401, { message: 'Sesi SMTP berakhir' });
  };
  await assert.rejects(() => api.saveSieveFilters('u@x.test', 'u@x.test', filters)); n++;
  ok(!calls.some((c) => c.opts.method === 'POST'), 'tanpa defaults segar → tidak menulis (cegah clobber Vacation/Forward)');
  await new Promise((r) => setTimeout(r, 5));
  ok(sessionExpired === 0, '401 /api/* tidak memicu logout SOGo');
  // fetchSieveFilters juga strict (tidak memakai cache localStorage)
  await assert.rejects(() => api.fetchSieveFilters('u@x.test', 'u@x.test')); n++;

  // ── 3. Respons tanpa defaults → throw ─────────────────────────────────────
  globalThis.fetch = async () => response(200, { foo: 1 });
  await assert.rejects(() => api.saveSieveFilters('u@x.test', 'u@x.test', filters)); n++;

  // ── 4. 502 dari SOGo (Sieve gagal) → error sieveFailed ────────────────────
  globalThis.fetch = async (url) => (String(url).startsWith('/api/preferences')
    ? response(200, { defaults: serverDefaults, settings: {} })
    : response(502, { message: 'Connection error' }));
  await assert.rejects(() => api.saveSieveFilters('u@x.test', 'u@x.test', filters), (e) => e.sieveFailed === true && e.status === 502); n++;

  // ── 5. fetchSieveFilters membaca SOGoSieveFilters / [] ────────────────────
  globalThis.fetch = async () => response(200, { defaults: serverDefaults, settings: {} });
  assert.deepEqual(await api.fetchSieveFilters('u@x.test', 'u@x.test'), serverDefaults.SOGoSieveFilters); n++;
  globalThis.fetch = async () => response(200, { defaults: {}, settings: {} });
  assert.deepEqual(await api.fetchSieveFilters('u@x.test', 'u@x.test'), []); n++;
  await assert.rejects(() => api.saveSieveFilters('u@x.test', 'u@x.test', 'bukan-array')); n++;
} finally {
  globalThis.fetch = originalFetch;
}

// ── Kontrak statis UI ────────────────────────────────────────────────────────
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('src/pages/RulesPage.jsx');
const quick = read('src/components/mailer/QuickRuleModal.jsx');
const mail = read('src/pages/MailPage.jsx');
const aa = read('src/lib/autoArchive.js');

ok(page.includes('role="switch"') && page.includes('aria-checked={checked}') && page.includes('aria-label={label}') && page.includes('label={`Aktifkan aturan ${name}`}'), 'RulesPage: saklar role=switch ber-label');
ok(page.includes('aria-label={`Naikkan prioritas ${name}`}') && page.includes('aria-label={`Turunkan prioritas ${name}`}'), 'RulesPage: tombol urutan ber-aria-label');
ok(page.includes('draggable:') && page.includes('onDrop'), 'RulesPage: drag untuk urutan');
ok(page.includes('role="dialog"') && page.includes('aria-modal="true"'), 'RulesPage: modal ber-role dialog');
ok(page.includes('saveSieveFilters(token, email, sogo)') && !/\baddRule\(/.test(page), 'RulesPage: simpan ke server, bukan localStorage');
ok(page.includes('Aturan berjalan di server — berlaku di webmail, Outlook, dan HP, walau browser ditutup.'), 'RulesPage: penjelasan server');
ok(page.includes("queryKey: ['preferences', token]"), 'RulesPage: invalidate preferences setelah save (cegah Vacation menimpa aturan)');
ok(page.includes('removeLegacyRules(email, migratedIds)'), 'RulesPage: migrasi menghapus aturan lama (tanpa double-apply)');
ok(page.includes('setRules(prev)'), 'RulesPage: rollback optimistic saat gagal');
ok(!/rounded-(2xl|3xl)/.test(page) && !/shadow-(xl|2xl)/.test(page), 'RulesPage: kontrak radius/shadow');
ok(!/text-\[(9|10)px\]/.test(page), 'RulesPage: teks ≥ 11px');
ok(quick.includes('saveSieveFilters(sogoToken, userEmail, next)') && !quick.includes('addRule'), 'QuickRuleModal: aturan server');
ok(quick.includes("emptyCondition('to_or_cc')"), 'QuickRuleModal: opsi Kepada atau Cc');
ok(mail.includes('sogoToken={user?.sogoToken}'), 'MailPage: token diteruskan ke QuickRuleModal');
ok(aa.includes('export function removeRules') && aa.includes("window.addEventListener('storage'"), 'autoArchive: removeRules + invalidasi cache lintas tab');

console.log(`sieve save + UI contract: ${n} assertions PASS ✅`);
