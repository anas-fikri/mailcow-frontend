// Signature per akun tersimpan di SERVER (defaults.PCPWebmailSignatures):
//  1. signatureStore: normalisasi, batas ukuran, dedupe, merge.
//  2. planSignatureRefresh: migrasi (server kosong → unggah; keduanya ada →
//     gabung), placeholder dilewati, konflik via updatedAt.
//  3. saveServerSignatures: read-modify-write defaults SEGAR (Sieve/Vacation
//     dipertahankan), mirror SOGoMailSignature, batal bila baca segar gagal.
//  4. Jalur simpan LAIN (savePreferences / saveSieveFilters /
//     ensureServerMarkReadDisabled) mempertahankan PCPWebmailSignatures.
//  5. signatures.js: refresh → cache, tulis → debounce POST, gagal → rollback.
import assert from 'node:assert/strict';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.document = { cookie: 'XSRF-TOKEN=abc' };

const S = await import('../src/lib/signatureStore.js');
const api = await import('../src/lib/api.js');
const sig = await import('../src/lib/signatures.js');

// ── 1. signatureStore ────────────────────────────────────────────────────────
eq(S.normalizeSignatureStore(undefined), null, 'absen → null');
eq(S.normalizeSignatureStore('rusak{'), null, 'string rusak → null');
eq(S.normalizeSignatureStore([1]), null, 'array → null');
const norm = S.normalizeSignatureStore(JSON.stringify({
  list: [{ id: 'a', name: ' A ', html: '<b>A</b>' }, { id: 'a', name: 'dup', html: 'x' }, { id: 'b' }, { id: 7, html: 'x' }, null],
  defaults: { new: 'a', reply: 'hilang' },
  updatedAt: 123,
}));
eq(norm, { v: 1, list: [{ id: 'a', name: 'A', html: '<b>A</b>' }], defaults: { new: 'a', reply: null }, updatedAt: 123 }, 'normalisasi: entri invalid/dup dibuang, default hilang → null');

const bigImg = `<img src="data:image/png;base64,${'A'.repeat(80_000)}">`;
assert.throws(() => S.validateSignatureStore({ list: [{ id: 'x', name: 'X', html: bigImg }] }), (e) => e.code === 'image-too-large' && /Gambar di signature terlalu besar/.test(e.message)); n++;
const manySmall = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, html: 'x'.repeat(4000) }));
assert.throws(() => S.validateSignatureStore({ list: manySmall }), (e) => e.code === 'too-large' && /64 KB/.test(e.message)); n++;
ok(S.validateSignatureStore({ list: [{ id: 'x', name: 'X', html: `<img src="data:image/png;base64,${'A'.repeat(20_000)}">` }] }), 'gambar kecil + total kecil → lolos');

const fromLocal = S.storeFromLocal([
  { id: 'p', name: 'Lama', html: '<p>Ketik…</p>', placeholder: true },
  { id: 'k1', name: 'Kantor', html: '<b>K</b>' },
  { id: 'k2', name: 'Kantor', html: ' <b>K</b> ' },
], { new: 'p', reply: 'k1' }, 5);
eq(fromLocal.list.map((s) => s.id), ['k1'], 'placeholder dilewati + dedupe nama+html');
eq(fromLocal.defaults, { new: null, reply: 'k1' }, 'default ke placeholder → null');

const merged = S.mergeSignatureStores(
  { list: [{ id: 's1', name: 'Kantor', html: '<b>K</b>' }], defaults: { new: 's1', reply: null }, updatedAt: 10 },
  [{ id: 'l1', name: 'Kantor', html: '<b>K</b>' }, { id: 'l2', name: 'HP', html: 'Dari HP' }, { id: 's1', name: 'beda', html: 'beda' }],
  { new: 'l2', reply: 'l2' },
);
eq(merged.store.list.map((s) => s.id), ['s1', 'l2'], 'merge: union by id, nama+html sama → dedupe');
eq(merged.store.defaults, { new: 's1', reply: 'l2' }, 'merge: default server dipertahankan, kosong diisi dari lokal');
ok(merged.changed, 'merge: changed');
ok(!S.mergeSignatureStores(merged.store, merged.store.list, merged.store.defaults).changed, 'merge idempotent');
eq(S.defaultNewHtml(merged.store), '<b>K</b>', 'defaultNewHtml');

// ── 2. planSignatureRefresh ──────────────────────────────────────────────────
let idn = 0;
const newId = () => `gen${++idn}`;
const P = (o) => sig.planSignatureRefresh({ newId, ...o });
const localA = { list: [{ id: 'l1', name: 'Kantor', html: '<b>K</b>' }], defaults: { new: 'l1', reply: 'l1' } };

let d = P({ server: null, local: localA, migrated: false });
ok(d.action === 'push' && d.store.list[0].id === 'l1' && d.store.defaults.new === 'l1', 'server absen + lokal ada → unggah');
d = P({ server: null, local: { list: [{ id: 'p', name: 'L', html: 'x', placeholder: true }], defaults: { new: 'p' } }, migrated: false });
eq(d, { action: 'none' }, 'server absen + hanya placeholder → tidak unggah');
d = P({ server: null, local: { list: [], defaults: {} }, migrated: false, sogoSignature: '<i>lama</i>' });
ok(d.action === 'push' && d.store.list[0].name === 'Signature' && d.store.list[0].html === '<i>lama</i>' && d.store.defaults.new === d.store.list[0].id, 'server absen + SOGoMailSignature lama → jadi signature pertama');
d = P({ server: null, local: { list: [], defaults: {} }, migrated: true });
eq(d, { action: 'none' }, 'tidak ada apa pun → none');

const srv = { v: 1, list: [{ id: 's1', name: 'Server', html: 'S' }], defaults: { new: 's1', reply: 's1' }, updatedAt: 1000 };
d = P({ server: srv, local: localA, migrated: false });
ok(d.action === 'push' && d.store.list.map((s) => s.id).join() === 's1,l1' && d.store.defaults.new === 's1', 'keduanya ada (2 perangkat) → GABUNG, default server');
d = P({ server: srv, local: { list: [{ id: 'x', name: 'Server', html: 'S' }], defaults: {} }, migrated: false });
ok(d.action === 'apply' && d.store.list.length === 1, 'lokal = server (nama+html) → apply tanpa duplikat');
d = P({ server: srv, local: localA, migrated: true, lastSyncedAt: 900 });
ok(d.action === 'apply' && d.store.list.length === 1 && d.store.list[0].id === 's1', 'sudah migrasi + server lebih baru → server menang (lokal tidak digabung)');
d = P({ server: srv, local: localA, migrated: true, lastSyncedAt: 2000 });
ok(d.action === 'push' && d.store.list[0].id === 'l1', 'server lebih lama dari salinan terakhir perangkat → push lokal');
d = P({ server: srv, local: localA, migrated: true, sogoSignature: '<i>beda</i>' });
ok(d.action === 'apply' && d.store.list.length === 1, 'setelah migrasi SOGoMailSignature tidak diimpor ulang');

// ── 3. saveServerSignatures / fetchServerSignatures ─────────────────────────
function response(status, data, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : '') },
    json: async () => data,
    text: async () => JSON.stringify(data ?? ''),
  };
}
const baseDefaults = () => {
  const dd = {
    Vacation: { enabled: '1', subject: 'Cuti', text: 'Halo' },
    Forward: { enabled: 0 },
    SOGoSieveFilters: [{ name: 'r1', active: 1 }],
    SOGoMailSignature: '<old>',
    SOGoMailAutoMarkAsReadDelay: -1,
  };
  for (let i = 0; i < 10; i++) dd[`K${i}`] = i;
  return dd;
};
let serverDefaults = baseDefaults();
let calls = [];
let prefsStatus = 200;
let saveStatus = 200;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (String(url).startsWith('/api/preferences')) {
    return prefsStatus === 200 ? response(200, { defaults: serverDefaults, settings: { Mail: 1 } }) : response(prefsStatus, { message: 'x' });
  }
  if (opts.method === 'POST' && saveStatus === 200) serverDefaults = JSON.parse(opts.body).defaults;
  return response(saveStatus, '', 'text/plain');
};
let sessionExpired = 0;
api.onSessionExpired(() => { sessionExpired++; });
const posts = () => calls.filter((c) => c.opts.method === 'POST');

eq(await api.fetchServerSignatures('u@x.test'), null, 'fetchServerSignatures: key absen → null');

const toSave = { list: [{ id: 'a', name: 'Kantor', html: '<b>K</b>' }, { id: 'b', name: 'HP', html: 'H' }], defaults: { new: 'a', reply: 'b' } };
calls = [];
const saved = await api.saveServerSignatures('u@x.test', 'u@x.test', toSave, { now: 5000 });
const post = posts()[0];
ok(post && /\/Preferences\/save$/.test(post.url), 'POST Preferences/save');
ok(calls.findIndex((c) => c.url.startsWith('/api/preferences')) < calls.indexOf(post), 'baca segar SEBELUM tulis');
const body = JSON.parse(post.opts.body);
ok(!('settings' in body), 'settings tidak dikirim');
eq(body.defaults.SOGoSieveFilters, [{ name: 'r1', active: 1 }], 'SOGoSieveFilters dipertahankan');
eq(body.defaults.Vacation, { enabled: '1', subject: 'Cuti', text: 'Halo' }, 'Vacation dipertahankan');
ok(body.defaults.K9 === 9, 'key lain dipertahankan');
ok(body.defaults.PCPWebmailSignatures.updatedAt === 5000 && body.defaults.PCPWebmailSignatures.list.length === 2, 'PCPWebmailSignatures ditulis + updatedAt');
ok(body.defaults.SOGoMailSignature === '<b>K</b>' && body.defaults.SOGoMailSignatureEnabled === '1', 'mirror SOGoMailSignature = default "new"');
ok(saved.updatedAt === 5000, 'mengembalikan store tersimpan');
const back = await api.fetchServerSignatures('u@x.test');
ok(back.list.length === 2 && back.defaults.reply === 'b', 'fetchServerSignatures membaca store');

calls = [];
await api.saveServerSignatures('u@x.test', 'u@x.test', { list: toSave.list, defaults: { new: null, reply: 'b' } }, { now: 6000 });
ok(JSON.parse(posts()[0].opts.body).defaults.SOGoMailSignature === '' && JSON.parse(posts()[0].opts.body).defaults.SOGoMailSignatureEnabled === '0', 'tanpa default "new" → mirror kosong + Enabled 0');

// Jam perangkat lain lebih cepat: simpanan baru tetap ber-updatedAt > server
serverDefaults = { ...serverDefaults, PCPWebmailSignatures: { ...serverDefaults.PCPWebmailSignatures, updatedAt: 9_000_000 } };
const skew = await api.saveServerSignatures('u@x.test', 'u@x.test', toSave, { now: 7000 });
ok(skew.updatedAt === 9_000_001, 'updatedAt > versi server (tahan selisih jam antar perangkat)');

calls = []; prefsStatus = 401;
await assert.rejects(() => api.saveServerSignatures('u@x.test', 'u@x.test', toSave)); n++;
ok(posts().length === 0, 'baca segar gagal → TIDAK menulis');
await new Promise((r) => setTimeout(r, 5));
ok(sessionExpired === 0, '401 /api/* tidak memicu logout');
prefsStatus = 200;

const saveDefaultsBackup = serverDefaults;
serverDefaults = { Vacation: { enabled: 1 } };
calls = [];
await assert.rejects(() => api.saveServerSignatures('u@x.test', 'u@x.test', toSave), /tidak lengkap/); n++;
ok(posts().length === 0, '< 10 key → batal tanpa menulis');
serverDefaults = saveDefaultsBackup;

calls = [];
await assert.rejects(() => api.saveServerSignatures('u@x.test', 'u@x.test', { list: [{ id: 'z', name: 'Z', html: bigImg }], defaults: {} }), /Gambar di signature terlalu besar/); n++;
ok(calls.length === 0, 'ukuran divalidasi SEBELUM jaringan');

// ── 4. Jalur simpan lain mempertahankan PCPWebmailSignatures ────────────────
const liveSig = serverDefaults.PCPWebmailSignatures;
// savePreferences dgn snapshot BASI (tanpa key signature, signature lama)
calls = [];
await api.savePreferences('u@x.test', { defaults: { ...baseDefaults(), SOGoTimeZone: 'Asia/Jakarta' }, settings: {} }, 'u@x.test');
let pb = JSON.parse(posts()[0].opts.body).defaults;
eq(pb.PCPWebmailSignatures, liveSig, 'savePreferences (snapshot basi) → signature server segar dipertahankan');
ok(pb.SOGoMailSignature === serverDefaults.SOGoMailSignature, 'savePreferences → mirror SOGoMailSignature segar');
ok(pb.SOGoTimeZone === 'Asia/Jakarta', 'savePreferences → perubahan pemanggil tetap ditulis');
// baca segar gagal → salinan signature terakhir yang diketahui tab ini
prefsStatus = 500; calls = [];
await api.savePreferences('u@x.test', { defaults: { ...baseDefaults(), PCPWebmailSignatures: { list: [], defaults: {}, updatedAt: 1 } }, settings: {} }, 'u@x.test');
pb = JSON.parse(posts()[0].opts.body).defaults;
eq(pb.PCPWebmailSignatures, liveSig, 'savePreferences (baca segar gagal) → salinan server terakhir menang atas snapshot lebih lama');
prefsStatus = 200;
// saveSieveFilters
calls = [];
await api.saveSieveFilters('u@x.test', 'u@x.test', [{ name: 'r2' }]);
eq(JSON.parse(posts()[0].opts.body).defaults.PCPWebmailSignatures, liveSig, 'saveSieveFilters mempertahankan PCPWebmailSignatures');
// ensureServerMarkReadDisabled
api.__resetServerMarkReadFlag();
serverDefaults = { ...serverDefaults, SOGoMailAutoMarkAsReadDelay: 0 };
calls = [];
await api.ensureServerMarkReadDisabled('u@x.test', 'u@x.test');
eq(JSON.parse(posts()[0].opts.body).defaults.PCPWebmailSignatures, liveSig, 'ensureServerMarkReadDisabled mempertahankan PCPWebmailSignatures');

// ── 5. signatures.js: refresh / tulis / rollback ─────────────────────────────
const EMAIL = 'me@x.test';
store.clear(); sig.__resetSignatureSync(); api.__resetServerSignatureMemo();
serverDefaults = baseDefaults(); // tanpa PCPWebmailSignatures
store.set(`pcp_signatures_v2_${EMAIL}`, JSON.stringify({ list: [{ id: 'l1', name: 'Kantor', html: '<b>K</b>' }], defaults: { new: 'l1', reply: 'l1' } }));
calls = [];
await sig.refreshSignaturesFromServer(EMAIL, 'tok');
ok(serverDefaults.PCPWebmailSignatures?.list?.[0]?.id === 'l1', 'migrasi: signature lokal diunggah ke server');
ok(store.get(`pcp_sig_migrated_v1_${EMAIL}`) === '1', 'migrasi ditandai per akun');
ok(sig.getSignatureSyncState(EMAIL).status === 'saved', 'status saved');

// Perangkat lain mengubah server (lebih baru) → refresh: server menang
serverDefaults = { ...serverDefaults, PCPWebmailSignatures: { v: 1, list: [{ id: 'r1', name: 'Dari HP', html: 'HP' }], defaults: { new: 'r1', reply: 'r1' }, updatedAt: Date.now() + 10_000 } };
await sig.refreshSignaturesFromServer(EMAIL, 'tok');
eq(sig.loadSignatures(EMAIL).list.map((s) => s.id), ['r1'], 'refresh: server lebih baru menimpa cache');
ok(sig.getSignatureFor(EMAIL, 'new').html === 'HP', 'compose membaca cache hasil refresh (sinkron)');

// Tulis → debounce → satu POST
calls = [];
sig.addSignature(EMAIL, 'Baru', '<i>baru</i>');
sig.setDefaultSignature(EMAIL, 'reply', sig.loadSignatures(EMAIL).list[1].id);
ok(posts().length === 0 && sig.getSignatureSyncState(EMAIL).status === 'saving', 'tulis optimistic: belum POST (debounce)');
await new Promise((r) => setTimeout(r, 700));
ok(posts().length === 1, 'debounce: dua tulis → satu POST');
ok(serverDefaults.PCPWebmailSignatures.list.length === 2, 'server menerima signature baru');
ok(sig.getSignatureSyncState(EMAIL).status === 'saved', 'status saved setelah sinkron');

// Gagal simpan → rollback cache + status error
const events = [];
const unsub = sig.subscribeSignatureSync((who, st) => events.push([who, st.status, st.kind]));
saveStatus = 500;
const before = store.get(`pcp_signatures_v2_${EMAIL}`);
sig.removeSignature(EMAIL, 'r1');
ok(sig.loadSignatures(EMAIL).list.length === 1, 'hapus optimistic');
await new Promise((r) => setTimeout(r, 700));
ok(store.get(`pcp_signatures_v2_${EMAIL}`) === before, 'gagal → cache di-rollback');
ok(sig.getSignatureSyncState(EMAIL).status === 'error' && sig.getSignatureSyncState(EMAIL).kind === 'save', 'status error (kind save → toast AppLayout)');
ok(events.some(([who, s]) => who === EMAIL && s === 'error'), 'listener diberi tahu');
unsub();
saveStatus = 200;

// Refresh gagal → cache utuh, tidak melempar
prefsStatus = 503;
const r = await sig.refreshSignaturesFromServer(EMAIL, 'tok');
ok(r === null && sig.loadSignatures(EMAIL).list.length === 2 && sig.getSignatureSyncState(EMAIL).kind === 'load', 'refresh gagal → cache utuh, status error load');
prefsStatus = 200;

// Akun kedua: server & lokal sama-sama punya isi (dua perangkat) → gabung
const E2 = 'two@x.test';
serverDefaults = { ...baseDefaults(), SOGoMailSignature: 'S', PCPWebmailSignatures: { v: 1, list: [{ id: 's1', name: 'Server', html: 'S' }], defaults: { new: 's1', reply: null }, updatedAt: 50 } };
store.set(`pcp_signatures_v2_${E2}`, JSON.stringify({ list: [{ id: 'l9', name: 'Laptop', html: 'L' }, { id: 'lp', name: 'Lama' }], defaults: { new: 'l9', reply: 'l9' } }));
await sig.refreshSignaturesFromServer(E2, 'tok');
eq(serverDefaults.PCPWebmailSignatures.list.map((s) => s.id), ['s1', 'l9'], 'gabung: union, placeholder tidak diunggah');
eq(serverDefaults.PCPWebmailSignatures.defaults, { new: 's1', reply: 'l9' }, 'gabung: default server dipertahankan');
ok(sig.loadSignatures(E2).list.some((s) => s.id === 'lp' && s.placeholder), 'placeholder legacy tetap di cache lokal');

sig.__resetSignatureSync();

// ── 6. Kontrak statis UI ─────────────────────────────────────────────────────
const { readFileSync } = await import('node:fs');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const prefsPage = read('src/pages/PreferencesPage.jsx');
const layout = read('src/components/layout/AppLayout.jsx');
const compose = read('src/components/mailer/ComposeModal.jsx');
ok(prefsPage.includes('Tersimpan di server — sama di semua perangkat'), 'Preferences: status tersimpan di server');
ok(prefsPage.includes('Berlaku di webmail di semua perangkat. Aplikasi email terpisah (Outlook/Mail di HP) memakai signature-nya sendiri.'), 'Preferences: catatan cakupan jujur');
ok(prefsPage.includes('checkSignatureDraft(email,') && !prefsPage.includes('Sinkronkan ke SOGo'), 'Preferences: validasi ukuran sebelum simpan; tombol manual dihapus');
ok(layout.includes('refreshSignaturesFromServer(email, token);') && layout.includes("state.kind === 'save'"), 'AppLayout: refresh saat login + toast gagal simpan');
ok(compose.includes("sigSync.status === 'loading' && !sigWaitOver"), 'Compose: compose pertama menunggu refresh (maks 3 dtk) bila cache kosong');
const apiSrc = read('src/lib/api.js');
ok(apiSrc.includes('DOMPurify.sanitize(html, PURIFY_CONFIG)'), 'saveServerSignatures menyanitasi html (PURIFY_CONFIG)');
ok(apiSrc.includes('prefs = { ...prefs, defaults: await withFreshServerOwnedKeys(email, prefs.defaults) };') && apiSrc.includes('SOGoMailAutoMarkAsReadDelay: -1 } };'), 'savePreferences: guard -1 tetap + key milik server dibaca segar');
console.log(`signature-sync: ${n} assertions PASS ✅`);
