/**
 * test-calendar-events.mjs — Konflik duplikat event kalender:
 *  1. parseCalendarEvents: dedup baris duplikat (id+start+calendar), recurring
 *     (start berbeda) TETAP dipertahankan, baris rusak tidak crash.
 *  2. EventModal: guard re-entry (savingRef) mencegah double-submit create
 *     (2x newEventGuid = 2 event) dan double-click hapus.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCalendarEvents, eventsOnDay } from '../src/lib/calendarEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };
const eq = (actual, expected, name) => {
  assert.deepStrictEqual(actual, expected, name);
  pass++;
  console.log(`  ✓ ${name}`);
};

// ── Helper: bangun raw eventsblocks ──────────────────────────────────────────
const FIELDS = ['c_name', 'c_title', 'c_startdate', 'c_enddate', 'c_isallday', 'c_iscycle', 'c_partmails', 'c_classification', 'calendarName', 'c_location', 'c_description', 'c_folder', 'c_owner', 'c_status', 'startHour'];

function cal(rows, calendarName = 'personal') {
  return [{
    eventsFields: FIELDS,
    blocks: rows.map((r) => {
      const row = { ...r };
      if (row.calendarName === undefined) row.calendarName = calendarName;
      return FIELDS.map((f) => row[f]);
    }),
  }];
}

// ── 1. Dedup baris duplikat ──────────────────────────────────────────────────
let evs = parseCalendarEvents(cal([
  { c_name: 'evt-1', c_title: 'Rapat', c_startdate: 1700000000, c_enddate: 1700003600 },
  { c_name: 'evt-1', c_title: 'Rapat', c_startdate: 1700000000, c_enddate: 1700003600 }, // duplikat persis
]));
assert.equal(evs.length, 1, 'baris duplikat persis → 1 event');
pass++;
ok(evs[0].id === 'evt-1' && evs[0].title === 'Rapat', 'event hasil dedup punya field benar');

// Recurring: id sama, start BERBEDA → SEMUA occurrence dipertahankan
evs = parseCalendarEvents(cal([
  { c_name: 'evt-r', c_title: 'Mingguan', c_startdate: 1700000000, c_iscycle: true },
  { c_name: 'evt-r', c_title: 'Mingguan', c_startdate: 1700604800, c_iscycle: true },
  { c_name: 'evt-r', c_title: 'Mingguan', c_startdate: 1701209600, c_iscycle: true },
]));
assert.equal(evs.length, 3, 'recurring (start berbeda) tidak di-dedup — 3 occurrence');
pass++;

// Cross-calendar: id+start sama tapi kalender beda → tetap 2 (bukan kembar SOGo)
evs = parseCalendarEvents([
  ...cal([{ c_name: 'evt-x', c_title: 'X', c_startdate: 1700000000 }], 'personal'),
  ...cal([{ c_name: 'evt-x', c_title: 'X', c_startdate: 1700000000 }], 'shared'),
]);
assert.equal(evs.length, 2, 'id+start sama di 2 kalender → dipertahankan (bukan duplikat)');
pass++;

// Normalisasi number vs string start untuk dedup
evs = parseCalendarEvents(cal([
  { c_name: 'evt-n', c_title: 'N', c_startdate: 1700000000 },
  { c_name: 'evt-n', c_title: 'N', c_startdate: '1700000000' }, // sama, tipe beda
]));
assert.equal(evs.length, 1, 'start number dan string "sama" di-dedup');
pass++;

// ── 2. Baris rusak tidak crash ───────────────────────────────────────────────
assert.deepEqual(parseCalendarEvents(null), [], 'raw null → []');
assert.deepEqual(parseCalendarEvents('garbage'), [], 'raw string → []');
assert.deepEqual(parseCalendarEvents([{ eventsFields: FIELDS, blocks: 'not-array' }]), [], 'blocks non-array → []');
assert.deepEqual(parseCalendarEvents([{ eventsFields: FIELDS, blocks: [null, 'x', 42] }]), [], 'baris non-array di-skip');
pass += 4;

// ── 3. Field mapping ─────────────────────────────────────────────────────────
evs = parseCalendarEvents(cal([{
  c_name: 'evt-a', c_title: 'All Day', c_startdate: 1700000000, c_enddate: 1700086400,
  c_isallday: true, c_iscycle: 0, c_partmails: 'a@x.com\nb@x.com', c_classification: 1,
  c_location: 'Ruang 1', calendarName: 'personal',
}]));
assert.equal(evs.length, 1);
ok(evs[0].isAllDay === true && evs[0].isRecurring === false, 'flag all-day/recurring dipetakan');
ok(evs[0].attendees === 'a@x.com, b@x.com', 'attendees newline → koma');
ok(evs[0].classification === 'private', 'classification 1 → private');
ok(evs[0].location === 'Ruang 1', 'location dipetakan');

// Tanpa judul → placeholder
evs = parseCalendarEvents(cal([{ c_name: 'evt-u', c_title: '', c_startdate: 1700000000 }]));
ok(evs[0].title === '(Tanpa Judul)', 'title kosong → placeholder');

// ── 3b. eventsOnDay: event multi-hari tampil di SEMUA hari yang di-span ─────
// Bangun unix dari MIDNIGHT LOKAL (bukan konstanta sembarang) agar batas hari
// presisi; end bersifat eksklusif.
const d1 = new Date(2026, 8, 15); // 15 Sep 2026 00:00 lokal
const day1 = Math.floor(d1.getTime() / 1000);
const day2 = day1 + 86400;
const day3 = day1 + 2 * 86400;
const mk = (id, start, end) => ({ id, start, end, isAllDay: false });
const spanEvents = [
  mk('konf', day1, day3),                                // konferensi 2 hari
  mk('rapat', day1 + 10 * 3600, day1 + 11 * 3600),       // 1 jam di hari 1
  mk('all', day1, day2),                                 // all-day (end eksklusif)
];
const d2 = new Date(day2 * 1000);
const d3 = new Date(day3 * 1000);

let onDay = eventsOnDay(spanEvents, d1);
ok(onDay.some((e) => e.id === 'konf'), 'multi-day tampil di hari 1');
ok(onDay.some((e) => e.id === 'rapat'), 'event 1 jam tampil di hari 1');
ok(onDay.some((e) => e.id === 'all'), 'all-day tampil di hari mulainya');

onDay = eventsOnDay(spanEvents, d2);
ok(onDay.some((e) => e.id === 'konf'), 'multi-day tampil di hari 2 (regresi: dulu hanya hari mulai)');
ok(!onDay.some((e) => e.id === 'rapat'), 'event 1 jam TIDAK tampil di hari 2');
ok(!onDay.some((e) => e.id === 'all'), 'all-day end eksklusif → tidak tampil di hari berikutnya');

onDay = eventsOnDay(spanEvents, d3);
ok(!onDay.some((e) => e.id === 'konf'), 'multi-day berakhir → tidak tampil di hari 3');

// Guard: events non-array / start rusak tidak crash.
assert.deepEqual(eventsOnDay(null, d1), [], 'events null → []');
pass++;
assert.deepEqual(eventsOnDay([{ id: 'x', start: 'invalid' }], d1), [], 'start invalid → di-skip');
pass++;
assert.deepEqual(eventsOnDay(spanEvents, new Date('invalid')), [], 'tanggal invalid → []');
pass++;

// ── 4. EventModal guard re-entry (static source check) ───────────────────────
const modal = fs.readFileSync(path.join(ROOT, 'src/components/EventModal.jsx'), 'utf8');
ok(modal.includes('const savingRef = useRef(false)'), 'EventModal punya savingRef');
ok(modal.includes('if (savingRef.current) return; // double-submit'), 'handleSave guard re-entry');
ok(modal.includes('if (savingRef.current) return; // double-click hapus'), 'handleDelete guard re-entry');
ok(modal.includes('savingRef.current = false'), 'savingRef di-reset di finally');

// ── 5. EventModal pakai helper tanggal LOKAL (regresi UTC/toISOString) ──────
ok(modal.includes("from '../lib/dateFormat'"), 'EventModal import dateFormat helper');
ok(!modal.includes('toISOString'), 'EventModal tidak boleh pakai toISOString utk tanggal');

// ── 6. CalendarPage: eventsOnDay (multi-day) + drag recurring ───────────────
const page = fs.readFileSync(path.join(ROOT, 'src/pages/CalendarPage.jsx'), 'utf8');
ok(page.includes("eventsOnDay as eventsForDay"), 'CalendarPage pakai eventsOnDay dari lib (multi-day)');
ok(!page.includes('function eventsForDay('), 'eventsForDay lokal dihapus (tidak ada duplikasi)');
ok(page.includes('if (ev.isRecurring && !ev.repeat)'), 'drag recurring cek repeat kosong');
ok(page.includes('await fetchCalendarEventDetail(user?.sogoToken, ev.id)'), 'drag recurring ambil detail via /view utk pola repeat');
ok(page.includes('eventData = { ...eventData, repeat: detail.repeat }'), 'repeat digabung sebelum simpan drag');

// ── 6b. layoutOverlappingEvents: event overlap side-by-side ─────────────────
const { layoutOverlappingEvents } = await import(pathToFileURL(path.join(ROOT, 'src/lib/calendarEvents.js')).href);

// Dua event overlap penuh (mulai sama) → 2 kolom masing 50%.
const l1 = layoutOverlappingEvents([
  { start: 3600, end: 7200 },
  { start: 3600, end: 7200 },
]);
eq(l1.length, 2, 'layout: 2 event overlap → 2 kolom');
eq(l1[0].leftPct, 0, 'event pertama kolom 0');
eq(l1[0].widthPct, 50, 'lebar 50% per kolom');
eq(l1[1].leftPct, 50, 'event kedua kolom 1 (50%)');

// Event berurutan (tidak overlap) → full-width 100%, kolom sama.
const l2 = layoutOverlappingEvents([
  { start: 3600, end: 5400 },
  { start: 7200, end: 9000 },
]);
eq(l2[0].widthPct, 100, 'event berurutan → full-width');
eq(l2[1].widthPct, 100, 'event berurutan kedua → full-width');

// Tumpukan 3: A(9-11), B(9.30-10), C(10.30-11.30) → 2 kolom (A & C sejajar,
// B di kolom lain).
const l3 = layoutOverlappingEvents([
  { start: 32400, end: 39600 }, // 09:00-11:00
  { start: 34200, end: 36000 }, // 09:30-10:00
  { start: 37800, end: 41400 }, // 10:30-11:30
]);
eq(l3.length, 3, 'layout: 3 event → 3 layout');
ok(l3[0].widthPct <= 50, 'A (09:00-11:00) tumpang tindih dgn B → bukan full-width');
ok(l3[1].widthPct === l3[0].widthPct, 'B satu tumpukan dgn A → lebar sama');

// Event tunggal → full-width 100%.
const l4 = layoutOverlappingEvents([{ start: 3600, end: 7200 }]);
eq(l4[0].widthPct, 100, 'event tunggal full-width');
eq(l4[0].leftPct, 0, 'event tunggal kiri 0');

// Array kosong / non-array aman.
eq(layoutOverlappingEvents([]).length, 0, 'kosong aman');
eq(layoutOverlappingEvents(null).length, 0, 'null aman');

// ── 7. openCreateModal: default jam 09:00 utk klik sel bulan / tombol Event ──
// Klik "+" sel bulan mengirim tanggal MIDNIGHT → tanpa default, event baru
// tercipta 00:00-01:00 (bukan 09:00-10:00). Week/Day view mengirim hour asli.
ok(page.includes('function openCreateModal(date, hour = null)'), 'openCreateModal terima param hour');
ok(page.includes('d.setHours(hour !== null ? hour : 9, 0, 0, 0)'), 'default jam 09:00 bila hour null (klik sel bulan)');
ok(page.includes('openCreateModal(d, hour)'), 'Week/Day view mengirim hour asli (jam 0 pun dihormati)');
ok(page.includes('openCreateModal(selected)'), 'tombol Event header tetap pakai selected (default 09:00)');

console.log(`\nCalendar-events: ${pass} assertions PASS ✅`);
