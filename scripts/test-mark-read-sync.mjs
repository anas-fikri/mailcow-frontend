#!/usr/bin/env node
// Bug "conversation aktif: email yang sudah dibuka tidak berubah jadi dibaca".
// Akar: GET /view SOGo sendiri menandai \Seen saat SOGoMailAutoMarkAsReadDelay=0
// → detail isRead:1 → effect MessageReader keluar dini → baris daftar tetap
// "belum dibaca". Kontrak:
//  1. Reader menyinkronkan daftar lokal saat detail sudah dibaca (tanpa request),
//     perbandingan uid String-safe, optimis di mode instant + rollback.
//  2. ensureServerMarkReadDisabled: read-modify-write defaults SEGAR, sekali
//     per akun (cache localStorage), tidak menulis bila baca gagal / sudah -1.
//  3. Hover-prefetch MailPage nonaktif sampai knob server terkonfirmasi -1.
//  4. planToolbar (header ringkas): toolbar satu baris, overflow ke menu.
import assert from 'node:assert/strict';
import fs from 'node:fs';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const reader = fs.readFileSync('src/components/mailer/MessageReader.jsx', 'utf8');
const mail = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');

// ── 1. Reader ────────────────────────────────────────────────────────────────
const effStart = reader.indexOf('const isRead = !!(msg && (msg.isRead === 1 || msg.isRead === true));');
const eff = reader.slice(effStart, reader.indexOf('// Toggle dibaca/belum dibaca manual', effStart));
ok(effStart > 0 && eff.length > 0, 'effect tandai-dibaca ditemukan');
ok(!eff.includes('if (!msg || !msgId || !token || isRead) return;'), 'effect tidak lagi keluar dini saat detail sudah dibaca');
const readBranch = eff.slice(eff.indexOf('if (isRead) {'), eff.indexOf("if (markReadMode === 'manual') return;"));
ok(readBranch.includes('onReadStateChange?.(msgId, true);'), 'detail sudah dibaca → sinkron daftar via onReadStateChange');
ok(!/markRead\(/.test(readBranch), 'sinkron saat sudah dibaca TANPA request jaringan');
ok(eff.includes('String(m.uid) !== String(targetUid)'), 'patch daftar di effect String-safe');
ok(reader.includes('String(m.uid) !== String(msgId)'), 'patchListCache String-safe');
ok(!reader.includes('m?.uid === targetUid') && !reader.includes('m?.uid !== msgId'), 'tidak ada perbandingan uid strict tersisa');
ok(eff.includes("const optimistic = markReadMode !== 'delay';"), 'mode instant optimis');
const runFn = eff.slice(eff.indexOf('const run = () => {'));
ok(runFn.indexOf('if (optimistic) {') < runFn.indexOf('markRead(token, targetFolder, targetUid, true)'), 'baris dipatch SEBELUM round-trip markRead (instant)');
ok(/catch\(\(\) => \{[\s\S]*onReadStateChange\?\.\(targetUid, false\);/.test(runFn), 'rollback optimis saat markRead gagal');
ok(eff.includes('autoReadDoneRef.current === doneKey'), 'tidak ada loop retry setelah rollback');
ok(reader.includes("if (markReadMode === 'manual') return;"), 'mode manual tetap tidak menandai otomatis');

// ── 3. Prefetch gated ────────────────────────────────────────────────────────
const pf = mail.slice(mail.indexOf('const schedulePrefetchMessage = useCallback('), mail.indexOf('const cancelPrefetchMessage'));
ok(pf.includes('if (!isServerMarkReadDisabled()) return;'), 'hover-prefetch digate flag knob server');
ok(pf.indexOf('isServerMarkReadDisabled()') < pf.indexOf('prefetchQuery'), 'gate sebelum prefetchQuery');
ok(/ensureServerMarkReadDisabled\(token, email\)\.catch\(/.test(mail), 'MailPage memanggil ensureServerMarkReadDisabled (non-blocking, error ditelan)');
ok(mail.includes('}, [user?.email, user?.sogoToken]);'), 'effect knob digate email + token');

// ── 2. ensureServerMarkReadDisabled (fetch dimock) ───────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.document = { cookie: '' };
const api = await import('../src/lib/api.js');
const EMAIL = 'a@b.c';
const baseDefaults = () => {
  const d = { SOGoMailAutoMarkAsReadDelay: 0, Vacation: { enabled: 1 }, Forward: { enabled: 0 }, SOGoSieveFilters: [{ name: 'r' }] };
  for (let i = 0; i < 10; i++) d[`K${i}`] = i;
  return d;
};
function mockFetch({ prefs, prefsStatus = 200, saveStatus = 200 }) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/api/preferences')) {
      return new Response(JSON.stringify(prefs), { status: prefsStatus, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: saveStatus, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
const saves = (calls) => calls.filter((c) => c.url.includes('/Preferences/save'));

// a) menulis sekali dgn defaults gabungan
store.clear(); api.__resetServerMarkReadFlag();
let calls = mockFetch({ prefs: { defaults: baseDefaults(), settings: { Mail: {} } } });
ok(api.isServerMarkReadDisabled() === false, 'flag awal false');
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === true, 'mengembalikan true setelah menulis -1');
ok(saves(calls).length === 1, 'tepat satu POST Preferences/save');
const body = JSON.parse(saves(calls)[0].opts.body);
ok(body.defaults.SOGoMailAutoMarkAsReadDelay === -1, 'menulis SOGoMailAutoMarkAsReadDelay=-1');
ok(body.defaults.Vacation?.enabled === 1 && body.defaults.SOGoSieveFilters?.length === 1 && body.defaults.K9 === 9, 'key lain ikut (defaults lengkap, SOGo replace)');
ok(!('settings' in body), 'settings tidak dikirim');
ok(store.get(`pcp_srv_markread_v1_${EMAIL}`) === '1', 'sukses di-cache per email');
ok(api.isServerMarkReadDisabled() === true, 'flag modul diset');

// b) cache → tanpa request
api.__resetServerMarkReadFlag();
calls = mockFetch({ prefs: { defaults: baseDefaults() } });
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === true, 'cache hit → true');
ok(calls.length === 0, 'cache hit → tanpa request');
ok(api.isServerMarkReadDisabled() === true, 'cache hit → flag diset');

// c) sudah -1 → tanpa write
store.clear(); api.__resetServerMarkReadFlag();
calls = mockFetch({ prefs: { defaults: { ...baseDefaults(), SOGoMailAutoMarkAsReadDelay: -1 } } });
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === true, 'sudah -1 → true');
ok(saves(calls).length === 0, 'sudah -1 → tidak menulis');
ok(store.get(`pcp_srv_markread_v1_${EMAIL}`) === '1', 'sudah -1 → di-cache');

// d) baca segar gagal → tanpa write
store.clear(); api.__resetServerMarkReadFlag();
calls = mockFetch({ prefs: { error: 'x' }, prefsStatus: 500 });
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === false, 'baca gagal → false');
ok(saves(calls).length === 0, 'baca gagal → tidak menulis');
ok(!store.has(`pcp_srv_markread_v1_${EMAIL}`), 'baca gagal → tidak di-cache');
ok(api.isServerMarkReadDisabled() === false, 'baca gagal → prefetch tetap nonaktif');

// e) defaults mencurigakan (< 10 key) → tanpa write
calls = mockFetch({ prefs: { defaults: { SOGoMailAutoMarkAsReadDelay: 0 } } });
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === false, '<10 key → false');
ok(saves(calls).length === 0, '<10 key → tidak menulis');

// f) save gagal → tidak di-cache
calls = mockFetch({ prefs: { defaults: baseDefaults() }, saveStatus: 500 });
ok(await api.ensureServerMarkReadDisabled('tok', EMAIL) === false, 'save gagal → false');
ok(!store.has(`pcp_srv_markread_v1_${EMAIL}`), 'save gagal → tidak di-cache (dicoba lagi nanti)');

// g) savePreferences tidak menyalakan kembali knob setelah terkonfirmasi
store.clear(); api.__resetServerMarkReadFlag();
mockFetch({ prefs: { defaults: { ...baseDefaults(), SOGoMailAutoMarkAsReadDelay: -1 } } });
await api.ensureServerMarkReadDisabled('tok', EMAIL);
calls = mockFetch({ prefs: {} });
await api.savePreferences('tok', { defaults: { ...baseDefaults() }, settings: {} }, EMAIL);
ok(JSON.parse(saves(calls)[0].opts.body).defaults.SOGoMailAutoMarkAsReadDelay === -1, 'savePreferences memaksa -1 saat knob terkonfirmasi');

// ── 4. planToolbar ───────────────────────────────────────────────────────────
const { planToolbar, TOOLBAR_OPTIONAL } = await import('../src/lib/mailToolbar.js');
ok(planToolbar(0).overflow.length === 0, 'lebar belum terukur → semua tampil');
ok(planToolbar(2000).visible.length === TOOLBAR_OPTIONAL.length, 'lebar besar → semua ikon tampil');
const narrow = planToolbar(288, { hamburger: true });
ok(narrow.visible.length === 0 && narrow.overflow.length === TOOLBAR_OPTIONAL.length, '320px mobile → semua ikon opsional ke menu');
for (const w of [200, 307, 340, 420, 520]) {
  const p = planToolbar(w);
  ok(p.visible.length + p.overflow.length === TOOLBAR_OPTIONAL.length, `w=${w}: tiap ikon tepat satu tempat`);
  ok(170 + (p.visible.length + 2) * 46 - 2 <= Math.max(w, 170 + 90), `w=${w}: toolbar muat satu baris`);
}
ok(planToolbar(400, { fixedSlots: 3 }).visible.length < planToolbar(400).visible.length, 'tombol Terjadwal mengurangi slot');
ok(planToolbar(307).visible[0] === 'unread', 'prioritas: belum dibaca tampil duluan');

console.log(`mark-read-sync: ${pass} assertions PASS`);
