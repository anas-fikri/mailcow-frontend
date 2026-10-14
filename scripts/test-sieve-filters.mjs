// Aturan server (Sieve) — konversi UI ⇄ SOGo, validasi, prioritas,
// matchesMessage (Cc / to_or_cc), planRun, migrasi aturan lama.
import assert from 'node:assert/strict';
import {
  fromSogoFilter, fromSogoFilters, toSogoFilter, toSogoFilters, validateRule, matchesMessage,
  matchesCondition, planRun, legacyToRule, mergeLegacyRules, moveItem, duplicateRule, describeRule,
  emptyRule, emptyCondition, folderIdToPath, pathToFolderId, ruleNeedsHeaders, extractAddresses, isRunnable,
} from '../src/lib/sieveFilters.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };
const strip = (r) => toSogoFilter(r);

// ── Round-trip: format SOGo persis (operator *_not, under/over, custom_header) ─
const sogo = [
  {
    name: 'Proyek', active: 1, match: 'all',
    rules: [
      { field: 'from', operator: 'contains', value: 'bayu' },
      { field: 'cc', operator: 'contains', value: 'nadya' },
      { field: 'to_or_cc', operator: 'is_not', value: 'x@y.com' },
      { field: 'header', custom_header: 'List-Id', operator: 'matches', value: '*proyek*' },
      { field: 'size', operator: 'over', value: '2048' },
    ],
    actions: [
      { method: 'fileinto', argument: 'INBOX/Proyek' },
      { method: 'addflag', argument: 'seen' },
      { method: 'addflag', argument: 'flagged' },
      { method: 'redirect', argument: 'boss@pcpexpress.com' },
      { method: 'stop' },
    ],
  },
  { name: 'Nonaktif', active: 0, match: 'any', rules: [{ field: 'subject', operator: 'regex_not', value: '^\\[spam' }], actions: [{ method: 'discard' }] },
  { name: 'Semua', active: '1', match: 'allmessages', rules: [], actions: [{ method: 'keep' }, { method: 'reject', argument: 'no' }, { method: 'addflag', argument: '$label1' }] },
];
const ui = fromSogoFilters(sogo);
eq(toSogoFilters(ui), [
  sogo[0],
  sogo[1],
  { ...sogo[2], active: 1 }, // "1" dinormalisasi jadi 1
], 'round-trip SOGo → UI → SOGo lossless');
eq(ui[0].conditions[4], { field: 'size', header: '', operator: 'over', value: '2', unit: 'MB' }, '2048 KB tampil 2 MB');
ok(ui[0].stop === true && !ui[0].actions.some((a) => a.type === 'stop'), 'stop jadi checkbox, bukan baris tindakan');
ok(ui[1].active === false && ui[2].active === true, 'active 0/"1" dinormalisasi');
eq(ui[2].actions.map((a) => a.type), ['keep', 'other', 'other'], 'reject/addflag label dipertahankan sebagai other');

// Field tak dikenal di filter dipertahankan (dibuat klien lain)
const withExtra = toSogoFilter(fromSogoFilter({ name: 'x', active: 1, match: 'all', rules: [], actions: [], foo: 'bar' }));
ok(withExtra.foo === 'bar', 'field ekstra filter dipertahankan');

// stop selalu TERAKHIR
const r1 = emptyRule({ name: 'a', conditions: [{ ...emptyCondition('from'), value: 'a@b.co' }], actions: [{ type: 'mark_seen' }], stop: true });
eq(strip(r1).actions, [{ method: 'addflag', argument: 'seen' }, { method: 'stop' }], 'stop di akhir');
// allmessages → rules kosong
eq(strip({ ...r1, match: 'allmessages' }).rules, [], 'allmessages tanpa rules');
// MB → KB
eq(strip({ ...r1, conditions: [{ field: 'size', operator: 'under', value: '5', unit: 'MB' }] }).rules, [{ field: 'size', operator: 'under', value: '5120' }], '5 MB → 5120 KB');
// value di-trim
eq(strip({ ...r1, conditions: [{ ...emptyCondition('subject'), value: '  hi ' }] }).rules[0].value, 'hi', 'value di-trim');

// Data rusak tidak melempar
eq(fromSogoFilters(null), [], 'non-array → []');
eq(fromSogoFilters([null, 'x', [], { name: 'ok' }]).length, 1, 'entri rusak dibuang');

// ── Prioritas (urutan) dipertahankan ─────────────────────────────────────────
const names = ['A', 'B', 'C'].map((name) => emptyRule({ name }));
eq(toSogoFilters(names).map((f) => f.name), ['A', 'B', 'C'], 'urutan simpan = urutan UI');
eq(moveItem(names, 2, 0).map((r) => r.name), ['C', 'A', 'B'], 'moveItem naik ke atas');
eq(moveItem(names, 0, 1).map((r) => r.name), ['B', 'A', 'C'], 'moveItem turun');
eq(moveItem(names, 0, 5).map((r) => r.name), ['A', 'B', 'C'], 'moveItem di luar batas = tidak berubah');
const dup = duplicateRule(ui[0]);
ok(dup.key !== ui[0].key && dup.name === 'Proyek (salinan)', 'duplikat: key baru + nama salinan');
eq(toSogoFilter(dup).rules, toSogoFilter(ui[0]).rules, 'duplikat menyalin kondisi');

// ── Validasi ─────────────────────────────────────────────────────────────────
const valid = emptyRule({ name: 'Ok', conditions: [{ ...emptyCondition('from'), value: 'bayu' }], actions: [{ type: 'fileinto', argument: 'Archive' }] });
eq(validateRule(valid), [], 'aturan valid');
ok(validateRule({ ...valid, name: ' ' }).some((e) => /Nama/.test(e)), 'nama wajib');
ok(validateRule({ ...valid, conditions: [{ ...emptyCondition('from'), value: '' }] }).some((e) => /kosong/.test(e)), 'nilai kosong ditolak');
ok(validateRule({ ...valid, conditions: [] }).length > 0, 'tanpa kondisi ditolak');
eq(validateRule({ ...valid, match: 'allmessages', conditions: [] }), [], 'allmessages boleh tanpa kondisi');
ok(validateRule({ ...valid, conditions: [{ ...emptyCondition('subject'), operator: 'regex', value: '([' }] }).some((e) => /regex/.test(e)), 'regex invalid ditolak');
eq(validateRule({ ...valid, conditions: [{ ...emptyCondition('subject'), operator: 'regex', value: '^inv[0-9]+' }] }), [], 'regex valid diterima');
ok(validateRule({ ...valid, conditions: [{ ...emptyCondition('header'), header: '', value: 'x' }] }).some((e) => /header/.test(e)), 'header lain wajib nama');
ok(validateRule({ ...valid, conditions: [{ ...emptyCondition('header'), header: 'Bad Name:', value: 'x' }] }).some((e) => /header tidak valid/.test(e)), 'nama header invalid');
ok(validateRule({ ...valid, conditions: [{ field: 'size', operator: 'over', value: '-1', unit: 'KB' }] }).some((e) => /ukuran/.test(e)), 'ukuran negatif ditolak');
ok(validateRule({ ...valid, actions: [{ type: 'redirect', argument: 'bukan-email' }] }).some((e) => /penerusan/.test(e)), 'redirect email invalid');
eq(validateRule({ ...valid, actions: [{ type: 'redirect', argument: 'a@pcpexpress.com' }] }), [], 'redirect email valid');
ok(validateRule({ ...valid, actions: [{ type: 'fileinto', argument: '' }] }).some((e) => /folder/.test(e)), 'fileinto wajib folder');
ok(validateRule({ ...valid, actions: [] , stop: false }).some((e) => /tindakan/.test(e)), 'tanpa tindakan ditolak');
ok(validateRule({ ...valid, actions: [{ type: 'discard' }, { type: 'keep' }] }).some((e) => /Hapus/.test(e)), 'discard + keep ditolak');
ok(validateRule({ ...valid, actions: [{ type: 'mark_seen' }, { type: 'mark_seen' }] }).some((e) => /sama/.test(e)), 'tindakan ganda ditolak');

// ── matchesMessage ───────────────────────────────────────────────────────────
const msg = { uid: 1, from: 'Bayu Aji <bayu@pcpexpress.com>', to: 'Anas <anas.fikri@pcpexpress.com>', subject: 'Laporan Proyek Q3', isRead: false, isFlagged: false };
const rule = (conditions, match = 'all') => emptyRule({ name: 't', match, conditions, actions: [{ type: 'mark_flagged' }] });
const c = (field, operator, value, extra = {}) => ({ ...emptyCondition(field), operator, value, ...extra });

ok(matchesMessage(rule([c('from', 'contains', 'bayu')]), msg) === true, 'Dari mengandung');
ok(matchesMessage(rule([c('from', 'contains', 'Aji')]), msg) === false, 'alamat, bukan nama tampilan (semantik Sieve address)');
ok(matchesMessage(rule([c('from', 'is', 'BAYU@pcpexpress.com')]), msg) === true, 'is case-insensitive');
ok(matchesMessage(rule([c('from', 'contains_not', 'bayu')]), msg) === false, 'contains_not');
ok(matchesMessage(rule([c('subject', 'matches', 'laporan*q?')]), msg) === true, 'wildcard * ?');
ok(matchesMessage(rule([c('subject', 'matches_not', 'laporan*')]), msg) === false, 'matches_not');
ok(matchesMessage(rule([c('subject', 'regex', 'Proyek Q[0-9]')]), msg) === true, 'regex');
ok(matchesMessage(rule([c('subject', 'regex', 'proyek q[0-9]')]), msg) === false, 'regex i;octet peka huruf');
ok(matchesMessage(rule([c('to', 'contains', 'anas.fikri')]), msg) === true, 'Kepada');
// Cc tidak ada di baris daftar → null (tak pasti), bukan false
ok(matchesMessage(rule([c('cc', 'contains', 'nadya')]), msg) === null, 'Cc tanpa data = null');
ok(ruleNeedsHeaders(rule([c('cc', 'contains', 'nadya')])) && !ruleNeedsHeaders(rule([c('from', 'contains', 'x')])), 'ruleNeedsHeaders');
const withCc = { ...msg, cc: 'Nadya <nadya@pcpexpress.com>, ops@pcpexpress.com' };
ok(matchesMessage(rule([c('from', 'contains', 'bayu'), c('cc', 'contains', 'nadya')]), withCc) === true, 'Dari DAN Cc');
ok(matchesMessage(rule([c('cc', 'is', 'ops@pcpexpress.com')]), withCc) === true, 'Cc is salah satu alamat');
ok(matchesMessage(rule([c('to_or_cc', 'contains', 'nadya')]), withCc) === true, 'to_or_cc via Cc');
ok(matchesMessage(rule([c('to_or_cc', 'contains', 'anas')]), withCc) === true, 'to_or_cc via To');
ok(matchesMessage(rule([c('to_or_cc', 'contains', 'zz')]), withCc) === false, 'to_or_cc tidak cocok');
ok(matchesMessage(rule([c('to_or_cc', 'contains', 'anas')]), msg) === null, 'to_or_cc tanpa Cc = null');
ok(matchesMessage(rule([c('cc', 'contains', 'x')]), { ...msg, cc: '' }) === false, 'Cc kosong → false');
ok(matchesMessage(rule([c('cc', 'contains_not', 'x')]), { ...msg, cc: '' }) === true, 'Cc kosong + negasi → true');
// Header lengkap via objek headers (hasil parseRawHeaders.get)
const viaHeaders = { ...msg, headers: { get: (n) => ({ cc: 'nadya@pcpexpress.com', 'list-id': '<proyek.pcp>' })[n.toLowerCase()] || '' } };
ok(matchesMessage(rule([c('cc', 'contains', 'nadya')]), viaHeaders) === true, 'Cc dari headers.get');
ok(matchesMessage(rule([c('header', 'contains', 'proyek', { header: 'List-Id' })]), viaHeaders) === true, 'header lain');
ok(matchesMessage(rule([c('header', 'contains', 'x', { header: 'List-Id' })]), msg) === null, 'header lain tanpa headers = null');
// any / all dengan null
ok(matchesMessage(rule([c('cc', 'contains', 'x'), c('from', 'contains', 'bayu')], 'any'), msg) === true, 'any: satu true cukup walau lain null');
ok(matchesMessage(rule([c('cc', 'contains', 'x'), c('from', 'contains', 'zzz')], 'any'), msg) === null, 'any: false+null = null');
ok(matchesMessage(rule([c('cc', 'contains', 'x'), c('from', 'contains', 'zzz')], 'all'), msg) === false, 'all: false menang atas null');
ok(matchesMessage(rule([], 'allmessages'), msg) === true, 'allmessages');
ok(matchesCondition(c('size', 'over', '1', { unit: 'KB' }), msg) === null, 'ukuran tanpa data = null');
ok(matchesCondition(c('size', 'over', '1', { unit: 'KB' }), { ...msg, size: 4096 }) === true, 'ukuran over');
eq(extractAddresses('A <a@x.com>, b@y.com'), ['a@x.com', 'b@y.com'], 'extractAddresses');

// ── planRun: prioritas + stop + satu kali pindah ────────────────────────────
const mk = (name, conds, actions, stop = true) => emptyRule({ name, conditions: conds, actions, stop });
const msgs = [
  { uid: 1, from: 'bayu@pcpexpress.com', to: 'me@pcpexpress.com', subject: 'A', isRead: false, isFlagged: false },
  { uid: 2, from: 'promo@shop.com', to: 'me@pcpexpress.com', subject: 'Diskon', isRead: true, isFlagged: false },
  { uid: 3, from: 'bayu@pcpexpress.com', to: 'me@pcpexpress.com', subject: 'Diskon', isRead: false, isFlagged: false },
];
const rulesP = [
  mk('Bayu', [c('from', 'contains', 'bayu')], [{ type: 'fileinto', argument: 'INBOX/Proyek' }, { type: 'mark_flagged' }], true),
  mk('Diskon', [c('subject', 'contains', 'diskon')], [{ type: 'fileinto', argument: 'Promo' }, { type: 'mark_seen' }], true),
];
let plan = planRun(rulesP, msgs, { sourcePath: 'INBOX' });
eq(plan.moves, { 'INBOX/Proyek': [1, 3], Promo: [2] }, 'aturan teratas menang + stop');
eq(plan.markFlagged, [1, 3], 'bendera dari aturan 1');
eq(plan.markSeen, [], 'uid 2 sudah dibaca, uid 3 berhenti di aturan 1');
plan = planRun([{ ...rulesP[0], stop: false }, rulesP[1]], msgs, { sourcePath: 'INBOX' });
eq(plan.moves, { 'INBOX/Proyek': [1, 3], Promo: [2] }, 'tanpa stop: pindah tetap sekali (fileinto pertama)');
eq(plan.markSeen, [3], 'tanpa stop: aturan 2 ikut menandai dibaca');
plan = planRun([{ ...rulesP[0], active: false }, rulesP[1]], msgs, { sourcePath: 'INBOX' });
eq(Object.keys(plan.moves), ['Promo'], 'aturan nonaktif dilewati');
plan = planRun(rulesP, msgs, { sourcePath: 'INBOX', isExcluded: (m) => m.uid === 1 });
eq(plan.moves['INBOX/Proyek'], [3], 'pesan di-snooze dikecualikan');
plan = planRun([mk('Same', [c('from', 'contains', 'bayu')], [{ type: 'fileinto', argument: 'INBOX' }])], msgs, { sourcePath: 'INBOX' });
eq(plan.moves, {}, 'tujuan = folder asal tidak dipindah');
plan = planRun([mk('Keep', [c('from', 'contains', 'bayu')], [{ type: 'fileinto', argument: 'X' }, { type: 'keep' }])], msgs, { sourcePath: 'INBOX' });
eq(plan.moves, {}, 'keep + fileinto (salinan) tidak dipindah di run manual');
plan = planRun([mk('Cc', [c('cc', 'contains', 'x')], [{ type: 'mark_seen' }])], msgs, {});
ok(plan.unknown === 3 && plan.matched.length === 0, 'Cc tanpa header dihitung tak-pasti');
ok(isRunnable(rulesP[0]) && !isRunnable(mk('fwd', [], [{ type: 'redirect', argument: 'a@b.co' }])), 'isRunnable');

// ── Folder id ⇄ path ─────────────────────────────────────────────────────────
eq(folderIdToPath('folderINBOX%2FProyek'), 'INBOX/Proyek', 'id → path');
eq(folderIdToPath('folderTrash'), 'Trash', 'id default → path');
eq(pathToFolderId('INBOX/Proyek'), 'folderINBOX%2FProyek', 'path → id (sesuai mailboxTree)');

// ── Migrasi aturan lama ──────────────────────────────────────────────────────
const legacy = [
  { id: 'l1', name: 'Bank', enabled: true, matchType: 'any', actionFolder: 'folderINBOX%2FBank',
    conditions: [{ field: 'from', operator: 'equals', value: 'bank@x.com' }, { field: 'subject', operator: 'startsWith', value: 'Tagihan*' }, { field: 'to', operator: 'endsWith', value: '@pcp.com' }, { field: 'subject', operator: 'notContains', value: 'promo' }] },
  { id: 'l2', name: 'Body saja', enabled: true, matchType: 'all', actionFolder: 'folderTrash', conditions: [{ field: 'body', operator: 'contains', value: 'x' }] },
  { id: 'l3', name: 'Off', enabled: false, matchType: 'all', actionFolder: 'folderArchive', conditions: [{ field: 'from', operator: 'contains', value: 'news' }] },
];
const m1 = toSogoFilter(legacyToRule(legacy[0]));
eq(m1, {
  name: 'Bank', active: 1, match: 'any',
  rules: [
    { field: 'from', operator: 'is', value: 'bank@x.com' },
    { field: 'subject', operator: 'matches', value: 'Tagihan\\**' },
    { field: 'to', operator: 'matches', value: '*@pcp.com' },
    { field: 'subject', operator: 'contains_not', value: 'promo' },
  ],
  actions: [{ method: 'fileinto', argument: 'INBOX/Bank' }, { method: 'stop' }],
}, 'migrasi: operator lama → Sieve + escape wildcard + fileinto path');
ok(legacyToRule(legacy[1]) === null, 'kondisi body tidak bisa dimigrasi');
ok(toSogoFilter(legacyToRule(legacy[2])).active === 0, 'status nonaktif dipertahankan');
ok(matchesMessage(legacyToRule(legacy[0]), { from: 'x@y.com', to: 'a@pcp.com', subject: 'z' }) === true, 'hasil migrasi matches (endsWith → *suffix)');
ok(matchesMessage(legacyToRule(legacy[0]), { from: 'x@y.com', to: 'a@b.com', subject: 'Tagihan* bulan ini promo' }) === true, 'startsWith dengan * literal');

const existing = fromSogoFilters([{ name: 'Server', active: 1, match: 'all', rules: [{ field: 'from', operator: 'contains', value: 's' }], actions: [{ method: 'keep' }] }]);
const merged = mergeLegacyRules(existing, legacy);
eq(merged.rules.map((r) => r.name), ['Server', 'Bank', 'Off'], 'migrasi ditaruh SETELAH aturan server');
eq(merged.migratedIds, ['l1', 'l3'], 'id yang dimigrasi');
ok(merged.skipped === 1, 'yang tidak bisa dimigrasi dihitung');
const again = mergeLegacyRules(merged.rules, legacy);
eq(again.rules.length, 3, 'migrasi ulang tidak menggandakan (idempoten)');

// ── Kalimat pratinjau ────────────────────────────────────────────────────────
const sentence = describeRule(mk('x', [c('from', 'contains', 'bayu'), c('cc', 'contains', 'nadya')], [{ type: 'fileinto', argument: 'INBOX/Proyek' }]), (p) => (p === 'INBOX/Proyek' ? 'Proyek' : p));
eq(sentence, "Jika Dari mengandung 'bayu' dan Cc mengandung 'nadya' → pindahkan ke 'Proyek', berhenti", 'kalimat pratinjau');

console.log(`sieveFilters: ${n} assertions PASS ✅`);
