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
import { fileURLToPath } from 'node:url';
import { parseCalendarEvents } from '../src/lib/calendarEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

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

// ── 4. EventModal guard re-entry (static source check) ───────────────────────
const modal = fs.readFileSync(path.join(ROOT, 'src/components/EventModal.jsx'), 'utf8');
ok(modal.includes('const savingRef = useRef(false)'), 'EventModal punya savingRef');
ok(modal.includes('if (savingRef.current) return; // double-submit'), 'handleSave guard re-entry');
ok(modal.includes('if (savingRef.current) return; // double-click hapus'), 'handleDelete guard re-entry');
ok(modal.includes('savingRef.current = false'), 'savingRef di-reset di finally');

console.log(`\nCalendar-events: ${pass} assertions PASS ✅`);
