import assert from 'node:assert/strict';
import { parseMessageDate, getDateGroup, groupMessagesByDate, sortMessagesByDate, reorderDateGroups, applyMessageWindow, DATE_GROUPS } from '../src/lib/dateGroups.js';

const now = new Date('2026-08-19T12:00:00');

// parseMessageDate — tolerant, never throws
assert.ok(parseMessageDate('2026-08-19T10:00:00Z') instanceof Date);
assert.ok(parseMessageDate('1690000000') instanceof Date); // epoch seconds
assert.equal(parseMessageDate(null), null);
assert.equal(parseMessageDate(undefined), null);
assert.equal(parseMessageDate(''), null);
assert.equal(parseMessageDate('garbage'), null);

// today / yesterday literals
assert.equal(getDateGroup('today', now).key, 'today');
assert.equal(getDateGroup('yesterday', now).key, 'yesterday');
assert.equal(getDateGroup('kemarin', now).key, 'yesterday');

// Epoch offsets → groups
const oneHourAgo = Math.floor(now.getTime() / 1000 - 3600);
const threeDaysAgo = Math.floor(now.getTime() / 1000 - 3 * 86400);
const tenDaysAgo = Math.floor(now.getTime() / 1000 - 10 * 86400);
const fortyDaysAgo = Math.floor(now.getTime() / 1000 - 40 * 86400);

assert.equal(getDateGroup(oneHourAgo, now).key, 'today');
assert.equal(getDateGroup(threeDaysAgo, now).key, 'thisWeek');
assert.equal(getDateGroup(tenDaysAgo, now).key, 'thisMonth');
assert.equal(getDateGroup(fortyDaysAgo, now).key, 'older');

// Unparseable → older bucket
assert.equal(getDateGroup('not-a-date', now).key, 'older');

// groupMessagesByDate preserves contiguous groups & order
const msgs = [
  { id: 1, date: oneHourAgo },
  { id: 2, date: oneHourAgo },
  { id: 3, date: fortyDaysAgo },
  { id: 4, date: fortyDaysAgo },
];
const groups = groupMessagesByDate(msgs, (m) => m.date, now);
assert.equal(groups.length, 2);
assert.equal(groups[0].key, 'today');
assert.equal(groups[0].messages.length, 2);
assert.equal(groups[1].key, 'older');
assert.equal(groups[1].messages.length, 2);

// DATE_GROUPS sanity
assert.ok(DATE_GROUPS.length >= 4);

// ── sortMessagesByDate: urut by DATE (bukan uid), date-descending ───────────
// uid SOGo per-folder TIDAK dijamin sekuensial dgn waktu — sort by uid bisa
// menyimpang dari urutan tanggal. Helper ini mengurutkan by tanggal, tiebreak
// uid desc utk pesan yang tanggalnya sama / tidak bisa di-parse.
const msgs2 = [
  { uid: 1, date: fortyDaysAgo },   // paling lama
  { uid: 2, date: oneHourAgo },     // terbaru
  { uid: 3, date: 'not-a-date' },   // unparseable → dianggap paling lama
  { uid: 4, date: oneHourAgo },     // tiebreak uid desc vs uid 2
  { uid: 5, date: tenDaysAgo },
];
const sorted = sortMessagesByDate(msgs2, { now });
assert.deepEqual(sorted.map((m) => m.uid), [4, 2, 5, 1, 3],
  'date-desc + uid-desc tiebreak; unparseable paling bawah');
// asc tidak membalik baris — hanya urutan grup di pemanggil (reorderDateGroups)
const sortedAsc = sortMessagesByDate(msgs2, { asc: true, now });
assert.deepEqual(sortedAsc.map((m) => m.uid), [4, 2, 5, 1, 3], 'asc tidak mengubah urutan baris');
// getDate custom dipakai bila disediakan (fallback ke field lain)
const msgs3 = msgs2.map((m) => ({ ...m, customDate: m.date === 'not-a-date' ? m.date : m.date }));
const sortedCustom = sortMessagesByDate(msgs3, { getDate: (m) => m.customDate, now });
assert.deepEqual(sortedCustom.map((m) => m.uid), [4, 2, 5, 1, 3], 'getDate custom dipakai');
// getDate yang selalu undefined → semua ts invalid → fallback uid-desc (deterministik)
const sortedUndef = sortMessagesByDate(msgs2, { getDate: () => undefined, now });
assert.deepEqual(sortedUndef.map((m) => m.uid), [5, 4, 3, 2, 1], 'semua tanggal invalid → uid-desc deterministik');

// ── reorderDateGroups: asc membalik urutan GRUP (header), isi grup tetap ────
const flatGroups = groupMessagesByDate(sorted, (m) => m.date, now);
assert.deepEqual(flatGroups.map((g) => g.key), ['today', 'thisMonth', 'older']);
const flatGroupsAsc = reorderDateGroups(flatGroups, true);
assert.deepEqual(flatGroupsAsc.map((g) => g.key), ['older', 'thisMonth', 'today'],
  'sortAsc (terlama dulu) → header Lebih Lama di atas');
assert.deepEqual(reorderDateGroups(flatGroups, false), flatGroups, 'tanpa asc tidak berubah');
// Isi tiap grup tetap date-descending walau grup dibalik.
assert.equal(flatGroupsAsc[2].messages.length, 2, 'grup Hari Ini tetap berisi pesan tsb');
assert.deepEqual(flatGroupsAsc[2].messages.map((m) => m.uid), [4, 2], 'isi grup tidak dibalik');

// ── applyMessageWindow (batas N bulan Kotak Masuk; search menembusnya) ───────
const now2 = new Date('2026-08-19T12:00:00Z');
const within  = { uid: 1, date: '2026-07-01T00:00:00Z' };  // 1.5 bulan lalu → dalam
const older   = { uid: 2, date: '2025-01-01T00:00:00Z' };  // >1 tahun → luar
const unparse = { uid: 3, date: 'aneh' };                  // tak terbaca → dianggap dalam
const all = [within, older, unparse];
assert.deepEqual(
  applyMessageWindow(all, { months: 5, now: now2 }).map((m) => m.uid),
  [1, 3],
  'pesan lama dibuang, tak terbaca tetap tampil'
);
assert.deepEqual(applyMessageWindow([older], { months: 5, now: now2 }), [], 'semua di luar window → kosong');
assert.deepEqual(applyMessageWindow([], { months: 5 }), []);
assert.deepEqual(applyMessageWindow(null, { months: 5 }), []);
assert.deepEqual(applyMessageWindow(undefined, { months: 5 }), []);
// months=0 → hanya pesan hari ini atau tak terbaca
const todayMsg = { uid: 4, date: now2.toISOString() };
assert.deepEqual(applyMessageWindow([todayMsg, older, unparse], { months: 0, now: now2 }).map((m) => m.uid), [4, 3]);

// ── parseMessageDate: format RelativeDate SOGo locale Indonesia ─────────────
// SOGo (locale 'id') mengembalikan RelativeDate sebagai STRING TAMPILAN:
// "Hari ini 09:41", "Kemarin 16:43", "Kamis 12:36", "28/08/2026".
// Sebelum fix, semuanya tak terbaca → ts=-Infinity → pesan terbaru TENGGELAM
// ke bawah daftar (sort by date), persis bug "email terbaru kok 28 Agustus".
const nowId = new Date('2026-09-03T10:00:00'); // Kamis

assert.deepEqual(
  parseMessageDate('Hari ini 09:41', nowId).getTime(),
  new Date('2026-09-03T09:41:00').getTime(),
  '"Hari ini 09:41" → hari ini jam 09:41'
);
assert.deepEqual(
  parseMessageDate('Kemarin 16:43', nowId).getTime(),
  new Date('2026-09-02T16:43:00').getTime(),
  '"Kemarin 16:43" → kemarin jam 16:43'
);
assert.deepEqual(
  parseMessageDate('Kamis 12:36', nowId).getTime(),
  new Date('2026-09-03T12:36:00').getTime(),
  '"Kamis 12:36" → Kamis terbaru (hari yang sama)'
);
assert.deepEqual(
  parseMessageDate('Senin 08:00', nowId).getTime(),
  new Date('2026-08-31T08:00:00').getTime(),
  '"Senin 08:00" → Senin terbaru (2 hari lalu)'
);
assert.deepEqual(
  parseMessageDate('28/08/2026', nowId).getTime(),
  new Date('2026-08-28T00:00:00').getTime(),
  '"28/08/2026" → 28 Agustus (day-first, bukan bulan-dulu)'
);
assert.deepEqual(
  parseMessageDate('05/08/2026', nowId).getTime(),
  new Date('2026-08-05T00:00:00').getTime(),
  '"05/08/2026" → 5 AGUSTUS (bukan 8 Mei ala US)'
);
assert.deepEqual(
  parseMessageDate('28/08', nowId).getTime(),
  new Date('2026-08-28T00:00:00').getTime(),
  '"28/08" (tanpa tahun) → tahun berjalan'
);
assert.deepEqual(
  parseMessageDate('12 Agustus 09:00', nowId).getTime(),
  new Date('2026-08-12T09:00:00').getTime(),
  '"12 Agustus 09:00" → 12 Agustus tahun ini'
);
assert.deepEqual(
  parseMessageDate('01/01', nowId).getTime(),
  new Date('2026-01-01T00:00:00').getTime(),
  '"01/01" → 1 Januari tahun berjalan (masa lalu, tanpa rollback)'
);

assert.deepEqual(
  parseMessageDate('30/12', nowId).getTime(),
  new Date('2025-12-30T00:00:00').getTime(),
  '"30/12" terbaca masa depan (Des 2026) → mundur ke 2025 (pesan tak pernah masa depan)'
);
// Sort end-to-end: pesan "Hari ini" harus DI ATAS, bukan tenggelam.
const indoMsgs = [
  { uid: '10', date: '28/08/2026' },      // lama (absolut)
  { uid: '11', date: 'Kamis 12:36' },     // hari ini (Kamis = nowId)
  { uid: '12', date: 'Hari ini 09:41' },  // hari ini, lebih pagi
  { uid: '13', date: 'Kemarin 16:43' },   // kemarin
];
const sortedId = sortMessagesByDate(indoMsgs, { now: nowId });
assert.deepEqual(
  sortedId.map((m) => m.uid),
  ['11', '12', '13', '10'],
  'email terbaru (Hari ini/Kemarin) harus di ATAS, bukan tenggelam di bawah 28/08'
);
// Tanggal Indonesia masuk grup yang benar
assert.equal(getDateGroup('Hari ini 09:41', nowId).key, 'today');
assert.equal(getDateGroup('Kemarin 16:43', nowId).key, 'yesterday');
assert.equal(getDateGroup('28/08/2026', nowId).key, 'thisWeek', '28 Agu dari 3 Sep = 6 hari → Minggu Ini');

// ── REGRESI 2026-09-04: format RelativeDate locale ENGLISH (SOGoLanguage) ────
// SOGo 5.12 UIxMailListActions.m messageDate():
//   - email HARI INI   → waktu polos TANPA kata "Today" ("10:38")
//   - kemarin          → "Yesterday 21:38"
//   - ≤6 hari          → nama hari locale ("Thursday 08:55")
//   - ≥7 hari          → short date ("04-Sep-26")
// Diverifikasi produksi: anas.fikri@pcpexpress.com SOGoLanguage=English — email
// hari ini (10:38) tenggelam ke bawah daftar di bawah "Kemarin 21:38" karena
// parser lama hanya mengenal format Indonesia + singkatan 3-huruf English.
const nowEn = new Date('2026-09-04T14:00:00'); // Jumat, 4 Sep 2026

// Waktu polos = email hari ini (cabang paling penting)
assert.deepEqual(
  parseMessageDate('10:38', nowEn).getTime(),
  new Date('2026-09-04T10:38:00').getTime(),
  '"10:38" (waktu polos) → HARI INI jam 10:38 — bukan NULL/tenggelam'
);
assert.deepEqual(
  parseMessageDate('09.05', nowEn).getTime(),
  new Date('2026-09-04T09:05:00').getTime(),
  '"09.05" (pemisah titik) → hari ini'
);
assert.equal(getDateGroup('10:38', nowEn).key, 'today', 'waktu polos masuk grup Hari Ini');

// Nama hari English penuh + singkatan
assert.deepEqual(
  parseMessageDate('Thursday 08:55', nowEn).getTime(),
  new Date('2026-09-03T08:55:00').getTime(),
  '"Thursday 08:55" → Kamis terbaru (kemarin)'
);
assert.deepEqual(
  parseMessageDate('Monday 12:36', nowEn).getTime(),
  new Date('2026-08-31T12:36:00').getTime(),
  '"Monday 12:36" → Senin terbaru (4 hari lalu)'
);
assert.deepEqual(
  parseMessageDate('Fri 09:00', nowEn).getTime(),
  new Date('2026-09-04T09:00:00').getTime(),
  '"Fri 09:00" → Jumat (hari ini) via singkatan'
);
assert.deepEqual(
  parseMessageDate('Yesterday 21:38', nowEn).getTime(),
  new Date('2026-09-03T21:38:00').getTime(),
  '"Yesterday 21:38" → kemarin (locale English)'
);
assert.deepEqual(
  parseMessageDate('Today 07:49', nowEn).getTime(),
  new Date('2026-09-04T07:49:00').getTime(),
  '"Today 07:49" → hari ini (locale English)'
);

// Short date SOGo English: "04-Sep-26" — day-first + nama bulan singkat
assert.deepEqual(
  parseMessageDate('28-Aug-26', nowEn).getTime(),
  new Date('2026-08-28T00:00:00').getTime(),
  '"28-Aug-26" (SOGoShortDateFormat) → 28 Agustus 2026'
);

// Sort end-to-end English: email "10:38" hari ini harus DI ATAS "Yesterday 21:38"
const englishMsgs = [
  { uid: '87',  date: 'Yesterday 21:38' }, // kemarin malam
  { uid: '136', date: '10:38' },           // HARI INI — dulu tenggelam!
  { uid: '129', date: 'Thursday 08:55' },  // Kamis lalu
  { uid: '126', date: '08:42' },           // hari ini, lebih pagi
  { uid: '98',  date: '28-Aug-26' },       // lama
];
const sortedEn = sortMessagesByDate(englishMsgs, { now: nowEn });
assert.deepEqual(
  sortedEn.map((m) => m.uid),
  ['136', '126', '87', '129', '98'],
  'email hari ini (10:38, 08:42) harus di ATAS "Yesterday 21:38" — reproduksi bug anas.fikri'
);

// Guard: waktu polos TIDAK boleh menelan format lain
assert.equal(parseMessageDate('garbage', nowEn), null, 'teks acak tetap NULL');
assert.equal(parseMessageDate('25.000,50', nowEn), null, 'angka desimal koma bukan jam');
assert.equal(
  parseMessageDate('12 Agustus 09:00', nowEn).getTime(),
  new Date('2026-08-12T09:00:00').getTime(),
  'format bulan-ID tetap menang atas waktu polos'
);

console.log('dateGroups assertions passed');
