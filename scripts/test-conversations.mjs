/**
 * Test: conversation grouping (Outlook-like) — src/lib/conversations.js
 * Pure function tests: normalizeSubject, senderDisplayName, groupConversations.
 */
import assert from 'node:assert';
import {
  normalizeSubject,
  senderDisplayName,
  messageParticipants,
  groupConversations,
} from '../src/lib/conversations.js';

let pass = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  pass++;
};
const eq = (actual, expected, label) => {
  assert.deepStrictEqual(actual, expected, label);
  pass++;
};

// ── normalizeSubject ──────────────────────────────────────────────────────────
eq(normalizeSubject('Re: Laporan'), 'laporan', 'strip Re:');
eq(normalizeSubject('Re: Fwd: Laporan'), 'laporan', 'strip Re: + Fwd: berulang');
eq(normalizeSubject('Fw: Laporan'), 'laporan', 'strip Fw:');
eq(normalizeSubject('AW: Laporan'), 'laporan', 'strip AW:');
eq(normalizeSubject('Laporan'), 'laporan', 'tanpa prefix');
eq(normalizeSubject(''), '', 'kosong → kosong');
eq(normalizeSubject(null), '', 'null → kosong');
eq(normalizeSubject(42), '', 'non-string → kosong');
ok(normalizeSubject('RE: Laporan') === 'laporan', 'RE uppercase');
ok(normalizeSubject('re: laporan') === 'laporan', 're lowercase');

// ── senderDisplayName ─────────────────────────────────────────────────────────
eq(senderDisplayName('Budi <budi@x.com>'), 'Budi', 'nama dari <email>');
eq(senderDisplayName('budi@x.com'), 'budi@x.com', 'tanpa nama → email');
eq(senderDisplayName(''), 'Unknown Sender', 'kosong → fallback');
eq(senderDisplayName(null), 'Unknown Sender', 'null → fallback');

// ── messageParticipants ───────────────────────────────────────────────────────
const parts1 = messageParticipants({
  from: 'A <a@x.com>',
  to: ['b@x.com', 'c@x.com'],
});
ok(parts1.has('a@x.com') && parts1.has('b@x.com') && parts1.has('c@x.com'), 'partisipan from+to');
eq(messageParticipants({ from: 'a@x.com', to: 'A <a@x.com>' }).size, 1, 'duplikat di-dedupe');

// ── groupConversations ────────────────────────────────────────────────────────
const m = (uid, from, subject, date, isRead = true, to) => ({
  uid, from, to, subject, date, isRead,
});

// 1) Thread A↔B dengan subjek sama → SATU grup (partisipan overlap),
//    walau from bergantian (alasan utama kenapa grouping by-subject saja gagal).
//    `to` ikut diset karena di thread asli alamat penerima saling mencakup.
// Caller (MailPage) menyortir date-desc → masukkan data dalam urutan tsb.
const t1 = groupConversations([
  m('3', 'A <a@x.com>', 'Re: Rapat', '2026-08-22 08:00', true, 'b@x.com'),
  m('2', 'B <b@x.com>', 'Rapat', '2026-08-21 09:00', false, 'a@x.com'),
  m('1', 'A <a@x.com>', 'Re: Rapat', '2026-08-20 10:00', true, 'b@x.com'),
]);
eq(t1.length, 1, 'thread A↔B jadi satu grup');
eq(t1[0].messages.length, 3, 'tiga pesan satu thread');
ok(t1[0].hasUnread, 'hasUnread true (ada belum dibaca)');
eq(t1[0].senders, ['A', 'B'], 'senders = nama unik (dedupe) urut kemunculan');


// 2) Subjek sama tapi partisipan TIDAK overlap (setelah akun sendiri
//    dikecualikan) → DUA grup (dua thread berbeda dari dua vendor).
//    Tanpa selfEmail, keduanya menyatu karena sama-sama ke user@mail.com.
const t2 = groupConversations([
  m('1', 'X <x@corp.com>', 'Invoice', '2026-08-20 10:00', true, 'user@mail.com'),
  m('2', 'Y <y@corp.com>', 'Re: Invoice', '2026-08-20 11:00', true, 'user@mail.com'),
], false, 'user@mail.com');
eq(t2.length, 2, 'Invoice berbeda dari pengirim berbeda → dua percakapan');
// Regresi: tanpa selfEmail keduanya menyatu (perilaku lama) — dokumentasi saja.
const t2NoSelf = groupConversations([
  m('1', 'X <x@corp.com>', 'Invoice', '2026-08-20 10:00', true, 'user@mail.com'),
  m('2', 'Y <y@corp.com>', 'Re: Invoice', '2026-08-20 11:00', true, 'user@mail.com'),
]);
eq(t2NoSelf.length, 1, 'tanpa selfEmail: fallback lama (menyatu)');

// 3) Grup diurutkan by pesan terbaru (date-desc); asc membalik urutan GRUP.
const t3 = groupConversations([
  m('2', 'B <b@x.com>', 'Baru', '2026-08-01 08:00', true, 'a@x.com'),
  m('1', 'A <a@x.com>', 'Lama', '2026-07-01 08:00', true, 'b@x.com'),
]);
eq(t3.map((g) => g.subject), ['Baru', 'Lama'], 'grup date-desc');
const t3asc = groupConversations([
  m('2', 'B <b@x.com>', 'Baru', '2026-08-01 08:00', true, 'a@x.com'),
  m('1', 'A <a@x.com>', 'Lama', '2026-07-01 08:00', true, 'b@x.com'),
], true);
eq(t3asc.map((g) => g.subject), ['Lama', 'Baru'], 'asc membalik urutan grup');

// 4) Key unik antar grup (subjek sama + partisipan beda → key berbeda).
ok(t2[0].key !== t2[1].key, 'key grup berbeda utk thread berbeda');

// 5) (tanpa subjek) dikelompokkan, sender fallback aman.
const t5 = groupConversations([
  m('1', '', null, '2026-08-20 08:00', true, ''),
  m('2', 'budi@x.com', null, '2026-08-21 08:00', true, ''),
], false, 'user@mail.com');
eq(t5.length, 1, '(tanpa subjek) dikelompokkan satu grup (partisipan kosong fallback)');
ok(t5[0].senders[0] === 'Unknown Sender', 'sender kosong → fallback');

// 6) Dua pesan mandiri (subjek beda) → dua grup.
const t6 = groupConversations([
  m('1', 'A <a@x.com>', 'Satu', '2026-08-20 08:00'),
  m('2', 'B <b@x.com>', 'Dua', '2026-08-21 08:00'),
]);
eq(t6.length, 2, 'subjek berbeda → dua grup');

// 7) Pesan di dalam satu grup tetap urutan input (date desc dari caller).
eq(t1[0].messages.map((x) => x.uid), ['3', '2', '1'], 'isi grup terbaru-dulu');
eq(t1[0].latest.uid, '3', 'latest = input pertama (terbaru)');

// 8) labelField 'to' (folder Terkirim/Draf): header menampilkan PENERIMA
//    (bukan from = alamat akun sendiri), konsisten dgn label baris.
const t8 = groupConversations([
  m('1', 'akun@mail.com', 'Laporan', '2026-08-20 08:00', true, 'Budi <budi@x.com>'),
  m('2', 'akun@mail.com', 'Re: Laporan', '2026-08-21 08:00', true, 'Budi <budi@x.com>'),
], false, 'akun@mail.com', { labelField: 'to' });
eq(t8[0].senders, ['Budi'], 'labelField=to → senders = penerima (thread ke Budi satu grup)');
const t8b = groupConversations([
  m('1', 'akun@mail.com', 'Laporan', '2026-08-20 08:00', true, 'Budi <budi@x.com>'),
], false, 'akun@mail.com', { labelField: 'from' });
eq(t8b[0].senders, ['akun@mail.com'], 'labelField default from → senders = pengirim');

console.log(`test-conversations: ${pass} assertion PASS`);
