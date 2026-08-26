import assert from 'node:assert/strict';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, fetchCalendarEventDetail, fetchCalendarEvents } from '../src/lib/api.js';

const calls = [];
let newguidPayload = { id: 'evt-123' };

const viewPayload = {
  component: 'vevent',
  summary: 'Rapat Tim',
  location: 'Ruang A',
  comment: 'Bahasan sprint',
  classification: 'private',
  isAllDay: false,
  startDate: '2026-08-21T09:00:00+07:00',
  endDate: '2026-08-21T10:00:00+07:00',
  attendees: [
    { email: 'a@example.test', name: 'A', partstat: 'ACCEPTED', role: 'REQ-PARTICIPANT' },
    { email: 'b@example.test', name: 'B', partstat: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT' },
  ],
  repeat: { frequency: 'weekly', interval: 2, count: 10 },
};

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, options });
  if (u.endsWith('/Calendar/personal/newguid')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => newguidPayload };
  }
  if (u.endsWith('/Calendar/personal/evt-123/view')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => viewPayload };
  }
  if (u.includes('/Calendar/eventsblocks')) {
    return {
      status: 200, ok: true, headers: { get: () => 'application/json' },
      json: async () => [{
        eventsFields: ['c_name', 'c_title', 'c_startdate', 'c_enddate', 'c_location', 'c_isallday', 'c_iscycle', 'c_description', 'c_partmails', 'c_classification'],
        blocks: [[
          'evt-1', 'Rapat', 1754200800, 1754204400, 'Ruang A', 0, 1, 'desc', 'a@example.test\nb@example.test', 0,
        ]],
      }],
    };
  }
  if (u.endsWith('/saveAsAppointment')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'evt-123' }) };
  }
  if (u.endsWith('/save')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'evt-123' }) };
  }
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
};

const event = {
  title: 'Rapat Tim',
  startDate: '2026-08-21',
  startTime: '09:00',
  endDate: '2026-08-21',
  endTime: '10:00',
  location: 'Ruang A',
  description: 'Bahasan sprint',
  isAllDay: false,
  attendees: 'a@example.test, b@example.test',
};

// ── createCalendarEvent ──────────────────────────────────────────────────────
const created = await createCalendarEvent('user@example.test', event);
assert.deepEqual(created, { id: 'evt-123' });

// newguid dipanggil dulu
assert.ok(calls.some((c) => c.url.endsWith('/Calendar/personal/newguid')), 'harus minta newguid');

// POST ke saveAsAppointment (capital A — case-sensitive)
const createCall = calls.find((c) => c.url.endsWith('/saveAsAppointment'));
assert.ok(createCall, 'create harus POST ke /saveAsAppointment (capital A)');
assert.equal(createCall.options.method, 'POST');

const createBody = JSON.parse(createCall.options.body);
assert.equal(createBody.summary, 'Rapat Tim');
assert.equal(createBody.location, 'Ruang A');
assert.equal(createBody.comment, 'Bahasan sprint');
assert.equal(createBody.classification, 'public');
assert.equal(createBody.isAllDay, false);
assert.equal(createBody.startDate, '2026-08-21');
assert.equal(createBody.startTime, '09:00');
assert.equal(createBody.endDate, '2026-08-21');
assert.equal(createBody.endTime, '10:00');
// field DB c_* TIDAK boleh dikirim
assert.equal(createBody.c_title, undefined, 'tidak boleh kirim c_title');
assert.equal(createBody.c_location, undefined, 'tidak boleh kirim c_location');
assert.equal(createBody.c_description, undefined, 'tidak boleh kirim c_description');
assert.equal(createBody.c_isallday, undefined, 'tidak boleh kirim c_isallday');
assert.equal(createBody.c_partmails, undefined, 'tidak boleh kirim c_partmails');

// attendees → array of {email, role, partstat}
assert.equal(createBody.attendees.length, 2);
assert.deepEqual(createBody.attendees[0], { email: 'a@example.test', name: 'a@example.test', role: 'REQ-PARTICIPANT', partstat: 'NEEDS-ACTION' });
assert.deepEqual(createBody.attendees[1], { email: 'b@example.test', name: 'b@example.test', role: 'REQ-PARTICIPANT', partstat: 'NEEDS-ACTION' });

// ── all-day: tanpa startTime/endTime, isAllDay true ──────────────────────────
calls.length = 0;
await createCalendarEvent('user@example.test', {
  title: 'Libur', startDate: '2026-08-22', endDate: '2026-08-22', isAllDay: true, attendees: '',
});
const allDayBody = JSON.parse(calls.find((c) => c.url.endsWith('/saveAsAppointment')).options.body);
assert.equal(allDayBody.isAllDay, true);
assert.equal(allDayBody.startTime, undefined);
assert.equal(allDayBody.endTime, undefined);
assert.equal(allDayBody.attendees, undefined, 'tanpa attendees tidak kirim field');

// ── newguid response plain string (robust) ───────────────────────────────────
newguidPayload = 'plain-uid-999';
calls.length = 0;
const created2 = await createCalendarEvent('user@example.test', { title: 'X', startDate: '2026-08-23', endDate: '2026-08-23', isAllDay: false });
assert.deepEqual(created2, { id: 'plain-uid-999' });
assert.ok(calls.some((c) => c.url.endsWith('/Calendar/personal/plain-uid-999/saveAsAppointment')), 'uid plain string dipakai di path');

// ── updateCalendarEvent ──────────────────────────────────────────────────────
calls.length = 0;
const updated = await updateCalendarEvent('user@example.test', 'evt-123', event);
assert.deepEqual(updated, { id: 'evt-123' });
const updateCall = calls.find((c) => c.url.endsWith('/Calendar/personal/evt-123/save'));
assert.ok(updateCall, 'update harus POST ke /save');
assert.equal(updateCall.options.method, 'POST');
const updateBody = JSON.parse(updateCall.options.body);
assert.equal(updateBody.summary, 'Rapat Tim');
assert.equal(updateBody.location, 'Ruang A');
assert.equal(updateBody.c_title, undefined, 'update juga tidak boleh kirim c_title');

// ── classification dipertahankan saat create/edit ────────────────────────────
calls.length = 0;
await createCalendarEvent('user@example.test', { ...event, classification: 'confidential' });
const classBody = JSON.parse(calls.find((c) => c.url.endsWith('/saveAsAppointment')).options.body);
assert.equal(classBody.classification, 'confidential');

// ── Edit/hapus SATU occurrence (recurrence_id SOGo 5) ────────────────────────
// Kontrak (UI SOGo 5.12.10 + SOGoCalendarComponent.lookupName): segmen path
// `occurence{unixSec}` = c_recurrence_id (unix detik start occurrence).
// Save/hapus/view ke segmen itu = exception RECURRENCE-ID / EXDATE, seri utuh.
const OCC_TS = 1754200800;
calls.length = 0;
const updOcc = await updateCalendarEvent('user@example.test', 'evt-123', event, 'personal', OCC_TS);
assert.deepEqual(updOcc, { id: 'evt-123' });
const updOccCall = calls.find((c) => c.url.endsWith(`/Calendar/personal/evt-123/occurence${OCC_TS}/save`));
assert.ok(updOccCall, 'update occurrence harus POST ke .../occurence{ts}/save');
assert.equal(updOccCall.options.method, 'POST');
const updOccBody = JSON.parse(updOccCall.options.body);
assert.equal(updOccBody.repeat, undefined, 'save occurrence TIDAK boleh kirim repeat (mengubah pola seri)');
assert.equal(updOccBody.summary, 'Rapat Tim');

calls.length = 0;
const updMaster = await updateCalendarEvent('user@example.test', 'evt-123', event);
assert.ok(calls.some((c) => c.url.endsWith('/Calendar/personal/evt-123/save')), 'update tanpa occurrenceId tetap ke /save biasa');

calls.length = 0;
const delOcc = await deleteCalendarEvent('user@example.test', 'evt-123', 'personal', OCC_TS);
assert.equal(delOcc, true);
assert.ok(calls.some((c) => c.url.endsWith(`/Calendar/personal/evt-123/occurence${OCC_TS}/delete`)), 'hapus occurrence harus GET .../occurence{ts}/delete');

calls.length = 0;
const detailOcc = await fetchCalendarEventDetail('user@example.test', 'evt-123', 'personal', OCC_TS);
assert.ok(calls.some((c) => c.url.endsWith(`/Calendar/personal/evt-123/occurence${OCC_TS}/view`)), 'detail occurrence harus GET .../occurence{ts}/view');
assert.equal(detailOcc.id, 'evt-123');

// ── fetchCalendarEventDetail (/view) ──────────────────────────────────────────
calls.length = 0;
const detail = await fetchCalendarEventDetail('user@example.test', 'evt-123');
assert.ok(calls.some((c) => c.url.endsWith('/Calendar/personal/evt-123/view')), 'detail harus GET /view');
assert.equal(detail.id, 'evt-123');
assert.equal(detail.title, 'Rapat Tim');
assert.equal(detail.location, 'Ruang A');
assert.equal(detail.description, 'Bahasan sprint');
assert.equal(detail.classification, 'private');
assert.equal(detail.attendees, 'a@example.test, b@example.test');
assert.ok(typeof detail.start === 'number' && detail.start > 0, 'start harus unix seconds');
assert.ok(typeof detail.end === 'number' && detail.end > detail.start, 'end harus > start');
assert.deepEqual(detail.repeat, { frequency: 'weekly', interval: 2, count: 10 }, 'repeat harus ikut ter-parse');

// ── repeat dikirim saat create (recurring event) ────────────────────────────
calls.length = 0;
await createCalendarEvent('user@example.test', {
  ...event,
  repeat: { frequency: 'monthly', interval: 1, until: '2026-12-31' },
});
const repeatBody = JSON.parse(calls.find((c) => c.url.endsWith('/saveAsAppointment')).options.body);
assert.deepEqual(repeatBody.repeat, { frequency: 'monthly', interval: 1, until: '2026-12-31' }, 'repeat harus dikirim ke body');

// ── weekly dengan pilihan hari (BYDAY) dikirim sebagai days: [{day}] ────────
calls.length = 0;
await createCalendarEvent('user@example.test', {
  ...event,
  repeat: { frequency: 'weekly', interval: 1, days: [{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }] },
});
const weeklyBody = JSON.parse(calls.find((c) => c.url.endsWith('/saveAsAppointment')).options.body);
assert.deepEqual(
  weeklyBody.repeat,
  { frequency: 'weekly', interval: 1, days: [{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }] },
  'repeat.days (Senin/Rabu/Jumat) harus dikirim ke body'
);

// ── tanpa repeat → field repeat tidak dikirim ───────────────────────────────
calls.length = 0;
await createCalendarEvent('user@example.test', { title: 'Tanpa ulang', startDate: '2026-08-23', endDate: '2026-08-23', isAllDay: false });
const noRepeatBody = JSON.parse(calls.find((c) => c.url.endsWith('/saveAsAppointment')).options.body);
assert.equal(noRepeatBody.repeat, undefined, 'tanpa repeat tidak kirim field');

// ── fetchCalendarEvents: map c_iscycle → isRecurring & c_partmails → attendees ─
calls.length = 0;
const events = await fetchCalendarEvents('user@example.test', 'personal', 1754200000, 1754300000);
assert.equal(events.length, 1);
assert.equal(events[0].id, 'evt-1');
assert.equal(events[0].isRecurring, true, 'c_iscycle=1 harus jadi isRecurring true');
assert.equal(events[0].attendees, 'a@example.test, b@example.test');
assert.equal(events[0].classification, 'public');

console.log('calendar API assertions passed');
