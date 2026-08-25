// ── Unit test: src/lib/calendarDrop.js (drag event kalender) ────────────────
// Regresi: buildDroppedEventData dulu menghilangkan attendees + repeat saat
// drag (attendees di-set '' dan repeat tidak dikirim) → peserta & recurrence
// hilang diam-diam setelah event dipindah.
import assert from 'node:assert';
import { buildDroppedEventData } from '../src/lib/calendarDrop.js';

const ev = {
  title: 'Rapat Bulanan',
  start: Math.floor(new Date('2026-08-20T10:00:00').getTime() / 1000),
  end: Math.floor(new Date('2026-08-20T11:00:00').getTime() / 1000),
  location: 'LT-2',
  description: 'Agenda bulanan',
  isAllDay: false,
  attendees: 'a@x.com, b@y.com',
  repeat: { frequency: 'monthly', interval: 1 },
  classification: 'PUBLIC',
};

// ── Durasi & tanggal target ─────────────────────────────────────────────────
const target = new Date('2026-08-25T00:00:00');
const data = buildDroppedEventData(ev, target, 14);

assert.equal(data.title, 'Rapat Bulanan', 'title dipertahankan'); 
assert.equal(data.startDate, '2026-08-25', 'startDate = tanggal target'); 
assert.equal(data.startTime, '14:00', 'startTime = jam target (14:00)'); 
assert.equal(data.endTime, '15:00', 'durasi 1 jam dipertahankan (end = 15:00)'); 
assert.equal(data.location, 'LT-2', 'lokasi dipertahankan'); 
assert.equal(data.description, 'Agenda bulanan', 'deskripsi dipertahankan'); 
assert.equal(data.isAllDay, false, 'isAllDay dipertahankan'); 

// ── REGRESI: attendees + repeat tidak boleh hilang ──────────────────────────
assert.equal(data.attendees, 'a@x.com, b@y.com', 'attendees dipertahankan saat drag (regresi: dulu hilang)'); 
assert.deepEqual(data.repeat, { frequency: 'monthly', interval: 1 }, 'pola repeat dipertahankan saat drag (regresi: dulu hilang)'); 
assert.equal(data.classification, 'PUBLIC', 'classification dipertahankan'); 

// ── All-day event: isAllDay tetap true ──────────────────────────────────────
const allDay = buildDroppedEventData({ ...ev, isAllDay: true, start: undefined, end: undefined }, target, null);
assert.equal(allDay.isAllDay, true, 'all-day event tetap all-day'); 
assert.equal(allDay.endTime, '10:00', 'all-day tanpa start/end → durasi default 1 jam (09:00–10:00)'); 

// ── Event tanpa repeat → null (tidak mengirim object kosong) ────────────────
const noRepeat = buildDroppedEventData({ ...ev, repeat: undefined, attendees: '' }, target, 9);
assert.equal(noRepeat.repeat, null, 'tanpa repeat → null (guard server skip)'); 
assert.equal(noRepeat.attendees, '', 'tanpa attendees → kosong'); 

// ── Drop di sel bulan (hour=null) → default 09:00 ───────────────────────────
const monthDrop = buildDroppedEventData(ev, new Date('2026-09-01T00:00:00'), null);
assert.equal(monthDrop.startTime, '09:00', 'drop sel bulan default 09:00'); 
assert.equal(monthDrop.startDate, '2026-09-01', 'tanggal target benar'); 

// ── Guard input ─────────────────────────────────────────────────────────────
assert.equal(buildDroppedEventData(null, target, 9), null, 'ev null → null'); 
assert.equal(buildDroppedEventData(ev, new Date('invalid'), 9), null, 'tanggal invalid → null'); 

console.log('calendarDrop assertions passed');
