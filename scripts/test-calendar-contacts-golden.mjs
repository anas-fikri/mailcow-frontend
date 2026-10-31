/**
 * GOLDEN-SAMPLE regression test — Calendar & Contacts.
 *
 * Fixture = respons HTTP 200 ASLI produksi (SOGo 5.12, mailcow, diag2):
 *  - calendar-golden-eventsblocks.json : 1 kalender, 3 occurrence event
 *    recurring harian (c_recurrence_id "occurence{ts}", c_partmails ARRAY).
 *  - calendar-golden-event-detail.json : /view detail event (startDate ISO
 *    tanpa detik "2026-09-05T10:00+07:00", attendees array of object).
 *  - contacts-golden-view.json         : 60 baris (59 GAL + 1 personal
 *    lengkap via flow guid; kolom headers DINAMIS antar request).
 *
 * Regenerate: scripts/capture-calendar-contacts-golden.sh
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCalendarEvents, eventsOnDay, layoutOverlappingEvents } from '../src/lib/calendarEvents.js';
import { parseContactRow, findDuplicateKind } from '../src/lib/contactUtils.js';

const here = join(dirname(fileURLToPath(import.meta.url)));
const eventsblocks = JSON.parse(readFileSync(join(here, 'fixtures/calendar-golden-eventsblocks.json'), 'utf8'));
const eventDetail = JSON.parse(readFileSync(join(here, 'fixtures/calendar-golden-event-detail.json'), 'utf8'));
const contactsView = JSON.parse(readFileSync(join(here, 'fixtures/contacts-golden-view.json'), 'utf8'));

// ── 1. Calendar: parse eventsblocks produksi ─────────────────────────────────
const events = parseCalendarEvents(eventsblocks);
assert.equal(events.length, 3, '3 occurrence event recurring ter-parse (dedup tidak membuang)');
const first = events[0];
assert.equal(first.title, 'Golden Rapat Harian');
assert.equal(first.location, 'Ruang Golden');
assert.equal(first.description, 'Uji golden sample kalender');
assert.equal(first.isRecurring, true, 'c_iscycle=1');
assert.equal(first.calendar, 'Personal Calendar');
assert.equal(first.owner, 'diag2@example.com');

// occurrenceId: string "occurence{ts}" dipertahankan apa adanya (prefix ganda
// membuat edit/hapus SATU occurrence 404 — bug yang sudah pernah terjadi).
assert.equal(first.occurrenceId, 'occurence1788577200');
assert.match(first.occurrenceId, /^occurence\d+$/);

// start/end = unix detik, dan occurrence berikutnya +24 jam
assert.equal(first.start, 1788577200);
assert.equal(events[1].start - events[0].start, 86400, 'recurring harian: +24 jam');

// BUG GOLDEN-SAMPLE: c_partmails produksi = ARRAY ["tim@..."] — dulu
// String(array) → "tim@..." tanpa spasi; kini array join(', ').
assert.equal(first.attendees, 'tim@example.com');
// Kompat: format string newline lama tetap didukung
const legacy = parseCalendarEvents([{ eventsFields: ['c_name', 'c_partmails'], events: [['x.ics', 'a@x\nb@y']] }]);
assert.equal(legacy[0].attendees, 'a@x, b@y');

// classification 0 → public
assert.equal(first.classification, 'public');

// ── 2. eventsOnDay: overlap hari (epoch detik → hari lokal) ─────────────────
// start 1788577200 = 2026-09-05 10:00 WIB. Uji pada hari itu (lokal).
const day = new Date(2026, 8, 5, 12, 0); // 5 Sep 2026, jam 12 lokal
const onDay = eventsOnDay(events, day);
assert.equal(onDay.length, 1, 'event tampil di hari mulainya');
assert.equal(eventsOnDay(events, new Date(2026, 8, 6, 12, 0)).length, 1, 'occurrence ke-2 di hari berikutnya');
assert.equal(eventsOnDay(events, new Date(2026, 8, 20, 12, 0)).length, 0, 'di luar rentang seri (count 3)');

// ── 3. layoutOverlappingEvents: 2 event jam sama → 2 kolom ───────────────────
const laid = layoutOverlappingEvents([
  { start: 100, end: 200 },
  { start: 100, end: 150 },
]);
assert.equal(laid.length, 2);
assert.ok(Math.abs(laid[0].widthPct - 50) < 0.01, 'dua event overlap → masing-masing ~50%');
assert.notEqual(laid[0].leftPct, laid[1].leftPct, 'tidak menimpa (kolom beda)');

// ── 4. Event detail (/view): field iCal lengkap ──────────────────────────────
// startDate "2026-09-05T10:00+07:00" (ISO tanpa detik) HARUS valid di JS.
assert.equal(eventDetail.summary, 'Golden Rapat Harian');
const sd = new Date(eventDetail.startDate);
assert.ok(!Number.isNaN(sd.getTime()), 'startDate detail ter-parse');
assert.equal(sd.getUTCHours(), 3, '10:00+07:00 = 03:00 UTC');
assert.equal(eventDetail.isAllDay, 0);
assert.ok(Array.isArray(eventDetail.attendees) && eventDetail.attendees[0].email === 'tim@example.com');

// ── 5. Contacts: parse view produksi (kolom dinamis!) ────────────────────────
// Urutan & nama kolom BEDA antar request (sourceID vs sourceid, ada/hilangnya
// c_uid, dsb) — parseContactRow wajib pakai peta kolom dinamis.
const cols = contactsView.headers[0];
const rows = contactsView.headers.slice(1);
const parsed = rows.map((r) => parseContactRow(cols, r)).filter(Boolean);
assert.equal(parsed.length, 60, '60 baris ter-parse (59 GAL + 1 personal)');

// Personal baris (guid flow) lengkap:
const personal = parsed.find((c) => c.email === 'golden.sample@example.com');
assert.ok(personal, 'kontak personal ditemukan');
assert.equal(personal.name, 'Golden Sample Kontak');
assert.equal(personal.phone, '+62-21-555-0199');
assert.equal(personal.isGAL, false, 'containerName personal → bukan GAL');
// CATATAN golden-sample: saveAsContact MENGABAIKAN field `c_o` di body
// (tersimpan ''); UI SOGo asli kirim org lewat array `orgs`. Form create SPA
// tidak punya field org — jadi bukan bug SPA; didokumentasikan di sini.

// GAL baris: email di c_mail, isGAL dari containerName
const gal = parsed.find((c) => c.email === 'person01@example.com');
assert.ok(gal, 'kontak GAL ditemukan');
assert.equal(gal.isGAL, true);
assert.ok(gal.uid, 'GAL punya uid (c_uid = email)');

// emails array-of-object (GAL shape) → firstEmail fallback
assert.equal(gal.email, 'person01@example.com');

// ── 6. Duplikat: personal vs GAL ─────────────────────────────────────────────
assert.equal(findDuplicateKind(parsed, 'golden.sample@example.com'), 'personal');
assert.equal(findDuplicateKind(parsed, 'person01@example.com'), 'gal');
assert.equal(findDuplicateKind(parsed, 'tidak.ada@x.test'), null);
assert.equal(findDuplicateKind(parsed, ''), null);

// Phantom `_new_` row (bug createContact lama) harus tetap ter-parse aman,
// bukan crash — dan TIDAK dianggap kontak valid bila email kosong.
const phantom = parseContactRow(['id', 'c_cn', 'c_mail', 'containerName'], ['_new_', '', '', 'Personal Address Book']);
assert.equal(phantom.email, '');
assert.equal(findDuplicateKind([{ email: '', isGAL: false }], 'x@y.z'), null);

console.log('✅ test-calendar-contacts-golden: semua golden-sample produksi lolos replay');
