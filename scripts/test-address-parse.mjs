// ── Unit test: parseAddressList + formatRecipientSummary (src/lib/format.js)
// dan senderDisplayName quote-strip (src/lib/conversations.js).
// Intent (Outlook-like recipient display): header mentah SOGo penuh artefak
// kutip ("'Eko Budi' <eko@x.com>"), nama ber-koma dalam kutip, pemisah
// koma/titik-koma, dan sisa RFC2047. UI harus menampilkan NAMA bersih tanpa
// kutip; ringkasan penerima dipangkas "+N".
// Jalankan: node scripts/test-address-parse.mjs
import assert from 'node:assert/strict';
import { parseAddressList, formatRecipientSummary } from '../src/lib/format.js';
import { senderDisplayName, stripSubjectPrefixes, groupConversations } from '../src/lib/conversations.js';

let pass = 0;
const ok = () => { pass++; };

// ── parseAddressList: bentuk dasar ──────────────────────────────────────────
assert.deepEqual(parseAddressList(null), [], 'null → []'); ok();
assert.deepEqual(parseAddressList(undefined), [], 'undefined → []'); ok();
assert.deepEqual(parseAddressList(''), [], 'string kosong → []'); ok();
assert.deepEqual(parseAddressList('a@x.com'), [{ name: '', email: 'a@x.com' }], 'alamat telanjang'); ok();
assert.deepEqual(
  parseAddressList('Budi <budi@x.com>'),
  [{ name: 'Budi', email: 'budi@x.com' }],
  'Name <email>'
); ok();

// ── Kutip pembungkus dibuang (tunggal & ganda, juga berlapis) ───────────────
assert.deepEqual(
  parseAddressList(`'Eko Budi' <eko@pcpexpress.com>`),
  [{ name: 'Eko Budi', email: 'eko@pcpexpress.com' }],
  "kutip tunggal 'Nama' dibuang"
); ok();
assert.deepEqual(
  parseAddressList('"Anas Fikri" <anas@x.com>'),
  [{ name: 'Anas Fikri', email: 'anas@x.com' }],
  'kutip ganda "Nama" dibuang'
); ok();
assert.deepEqual(
  parseAddressList(`"'Ine'" <ine@x.com>`),
  [{ name: 'Ine', email: 'ine@x.com' }],
  'kutip berlapis dibuang berulang'
); ok();

// ── Pemisah koma & titik-koma; nama ber-koma dalam kutip tidak terbelah ─────
assert.deepEqual(
  parseAddressList(`'Eko Budi' <eko@x.com>, usep.sopiyan@x.com; fadh.dwi@x.com`),
  [
    { name: 'Eko Budi', email: 'eko@x.com' },
    { name: '', email: 'usep.sopiyan@x.com' },
    { name: '', email: 'fadh.dwi@x.com' },
  ],
  'koma + titik-koma sebagai pemisah'
); ok();
assert.deepEqual(
  parseAddressList('"Fikri, Anas" <anas@x.com>, b@y.co'),
  [
    { name: 'Fikri, Anas', email: 'anas@x.com' },
    { name: '', email: 'b@y.co' },
  ],
  'koma DI DALAM kutip tidak membelah token'
); ok();

// ── Bentuk SOGo: array objek {name,email} & array string campuran ───────────
assert.deepEqual(
  parseAddressList([{ name: "'Anita'", email: 'anita@x.com' }, null, 'C <c@x.com>']),
  [
    { name: 'Anita', email: 'anita@x.com' },
    { name: 'C', email: 'c@x.com' },
  ],
  'array campuran objek (kutip dibuang) + null dilewati + string diparse'
); ok();
assert.deepEqual(
  parseAddressList([{ address: 'd@x.com' }]),
  [{ name: '', email: 'd@x.com' }],
  'objek pakai field address'
); ok();

// ── RFC2047 trivial ─────────────────────────────────────────────────────────
assert.deepEqual(
  parseAddressList('=?utf-8?Q?Budi_Santoso?= <budi@x.com>'),
  [{ name: 'Budi Santoso', email: 'budi@x.com' }],
  'Q-encoding: underscore → spasi'
); ok();
assert.deepEqual(
  parseAddressList('=?utf-8?Q?Caf=C3=A9?= <cafe@x.com>'),
  [{ name: 'Café', email: 'cafe@x.com' }],
  'Q-encoding: =HH byte UTF-8'
); ok();
assert.deepEqual(
  parseAddressList('=?utf-8?B?QnVkaQ==?= <b@x.com>'),
  [{ name: 'Budi', email: 'b@x.com' }],
  'B-encoding base64'
); ok();

// ── Nama tanpa email / token kosong ─────────────────────────────────────────
assert.deepEqual(parseAddressList("'Tim Ops'"), [{ name: 'Tim Ops', email: '' }], 'nama saja (tanpa @)'); ok();
assert.deepEqual(parseAddressList(', ,;'), [], 'pemisah saja → []'); ok();

// ── formatRecipientSummary ──────────────────────────────────────────────────
const five = [
  { name: 'Eko Budi', email: 'eko@x.com' },
  { name: 'Usep Sopiyan', email: 'usep@x.com' },
  { name: 'Fadh Dwi', email: 'fadh@x.com' },
  { name: '', email: 'anita@x.com' },
  { name: 'Anas Fikri', email: 'anas@x.com' },
];
assert.equal(
  formatRecipientSummary(five, { max: 3 }),
  'Eko Budi, Usep Sopiyan, Fadh Dwi +2',
  'dipangkas +N; fallback email utk entri tanpa nama'
); ok();
assert.equal(
  formatRecipientSummary(five.slice(0, 2), { max: 3 }),
  'Eko Budi, Usep Sopiyan',
  'muat semua → tanpa +N'
); ok();
assert.equal(
  formatRecipientSummary(five, { max: 3, moreSuffix: ' lainnya' }),
  'Eko Budi, Usep Sopiyan, Fadh Dwi +2 lainnya',
  'moreSuffix utk copy berbahasa'
); ok();
assert.equal(formatRecipientSummary([], { max: 3 }), '', 'daftar kosong → string kosong'); ok();
assert.equal(formatRecipientSummary(null), '', 'null → string kosong'); ok();

// ── senderDisplayName (conversations.js): kutip pembungkus dibuang ──────────
assert.equal(senderDisplayName(`'Ine' <ine@pcpexpress.com>`), 'Ine', 'kutip tunggal dibuang'); ok();
assert.equal(senderDisplayName('"Linode Alerts" <noreply@linode.com>'), 'Linode Alerts', 'kutip ganda dibuang'); ok();
assert.equal(senderDisplayName('A <a@x.com>'), 'A', 'tanpa kutip tetap sama (regresi)'); ok();
assert.equal(senderDisplayName(''), 'Unknown Sender', 'fallback tetap'); ok();

// ── stripSubjectPrefixes + displaySubject (header thread tanpa Re:/Fwd:) ─────
assert.equal(stripSubjectPrefixes('RE: RE: Jadwal Meeting'), 'Jadwal Meeting', 'prefix Re: berulang dibuang, kapital asli dipertahankan'); ok();
assert.equal(stripSubjectPrefixes('Fwd: FW: Laporan'), 'Laporan', 'prefix Fwd:/FW: dibuang'); ok();
assert.equal(stripSubjectPrefixes('Laporan Harian'), 'Laporan Harian', 'tanpa prefix tetap utuh'); ok();
const grp = groupConversations([
  { uid: '1', from: 'A <a@x.com>', subject: 'RE: Jadwal Meeting', date: '2026-08-22 08:00', isRead: true },
  { uid: '2', from: 'B <b@x.com>', subject: 'Jadwal Meeting', date: '2026-08-21 09:00', isRead: true },
]);
assert.equal(grp[0].displaySubject, 'Jadwal Meeting', 'group.displaySubject tanpa prefix'); ok();
assert.ok(grp[0].subject.length > 0, 'subject asli tetap tersedia utk title/aria'); ok();

console.log(`address-parse: ${pass} assertions PASS`);
