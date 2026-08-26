// ── Unit test: src/lib/calendarDrop.js (drag event kalender) ────────────────
// Regresi: buildDroppedEventData dulu menghilangkan attendees + repeat saat
// drag (attendees di-set '' dan repeat tidak dikirim) → peserta & recurrence
// hilang diam-diam setelah event dipindah.
//
// Regresi #2 (timezone): tanggal pakai toISOString() (UTC) → drag ke slot
// dini hari (02:00 WIB = 19:00 UTC hari sebelumnya) mendarat di hari KEMARIN.
import assert from 'node:assert';

// WIB (UTC+7) — TZ paling umum pemakai aplikasi ini.
process.env.TZ = 'Asia/Jakarta';

const { buildDroppedEventData } = await import('../src/lib/calendarDrop.js');

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

// ── REGRESI timezone: drag ke slot dini hari (02:00) → TANGGAL SAMA HARI ────
// 02:00 WIB = 19:00 UTC hari sebelumnya — toISOString salah, helper lokal benar.
const dawn = buildDroppedEventData(ev, new Date('2026-08-27T00:00:00'), 2);
assert.equal(dawn.startDate, '2026-08-27', 'drag ke 02:00 → tanggal 27 (bukan 26)'); 
assert.equal(dawn.startTime, '02:00', 'jam target 02:00'); 
assert.equal(dawn.endTime, '03:00', 'durasi 1 jam dipertahankan'); 

// Drop ke midnight (00:00) via sel hari — tanggal tidak bergeser.
const mid = buildDroppedEventData(ev, new Date('2026-08-28T00:00:00'), 0);
assert.equal(mid.startDate, '2026-08-28', 'drag ke 00:00 → tanggal 28 (bukan 27)'); 

// ── REGRESI: isRecurring diteruskan (safety net recurrence di CalendarPage) ─
// handleUpdateEvent me-resolve repeat via /view saat event berulang tapi
// payload tidak membawa repeat — kalau isRecurring tidak diteruskan, drag
// event berulang bisa menyimpan tanpa repeat → pola hilang diam-diam.
const rec = buildDroppedEventData({ ...ev, isRecurring: true }, target, 9);
assert.equal(rec.isRecurring, true, 'isRecurring diteruskan utk safety net');
assert.equal(rec.repeatTouched, false, 'drag tidak menyentuh kontrol repeat');
const nonRec = buildDroppedEventData({ ...ev, isRecurring: false }, target, 9);
assert.equal(nonRec.isRecurring, false, 'non-recurring → false');

// ── Guard input ─────────────────────────────────────────────────────────────
assert.equal(buildDroppedEventData(null, target, 9), null, 'ev null → null'); 
assert.equal(buildDroppedEventData(ev, new Date('invalid'), 9), null, 'tanggal invalid → null'); 

console.log('calendarDrop assertions passed');
