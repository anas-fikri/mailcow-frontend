/**
 * test-event-validation.mjs — Edge case event kalender:
 *  1. validateEventTimes: end-before-start ditolak (timed + lintas tanggal),
 *     all-day valid, tanggal invalid ditolak.
 *  2. normalizeRepeatCount: 0/negatif/NaN → 1; valid → di-clamp ke integer ≥1.
 */

import assert from 'node:assert/strict';
import { validateEventTimes, normalizeRepeatCount } from '../src/lib/eventValidation.js';

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── validateEventTimes ───────────────────────────────────────────────────────
// Valid: start 09:00 end 10:00
assert.deepEqual(validateEventTimes({
  startDate: '2026-08-26', startTime: '09:00',
  endDate: '2026-08-26', endTime: '10:00', isAllDay: false,
}), { ok: true });
pass++;

// End SAMA dengan start → ok (durasi 0, bukan negatif)
assert.deepEqual(validateEventTimes({
  startDate: '2026-08-26', startTime: '09:00',
  endDate: '2026-08-26', endTime: '09:00', isAllDay: false,
}), { ok: true });
pass++;

// Timed: end < start hari yang sama → tolak
const t1 = validateEventTimes({
  startDate: '2026-08-26', startTime: '14:00',
  endDate: '2026-08-26', endTime: '13:00', isAllDay: false,
});
ok(t1.ok === false && /selesai/.test(t1.message), 'timed end < start ditolak dgn pesan');

// Lintas tanggal: end date sebelum start date → tolak
const t2 = validateEventTimes({
  startDate: '2026-08-27', startTime: '09:00',
  endDate: '2026-08-26', endTime: '10:00', isAllDay: false,
});
ok(t2.ok === false, 'end date sebelum start date ditolak');

// Lintas tanggal valid (mulai malam, selesai besok) → ok
assert.deepEqual(validateEventTimes({
  startDate: '2026-08-26', startTime: '22:00',
  endDate: '2026-08-27', endTime: '01:00', isAllDay: false,
}), { ok: true });
pass++;

// All-day: start==end tanggal sama → valid (event seharian)
assert.deepEqual(validateEventTimes({
  startDate: '2026-08-26', startTime: '', endDate: '2026-08-26', endTime: '', isAllDay: true,
}), { ok: true });
pass++;

// All-day: end sebelum start → tolak
ok(validateEventTimes({
  startDate: '2026-08-27', startTime: '', endDate: '2026-08-26', endTime: '', isAllDay: true,
}).ok === false, 'all-day end < start ditolak');

// Tanggal rusak → tolak (bukan crash)
ok(validateEventTimes({
  startDate: 'not-a-date', startTime: '09:00',
  endDate: '2026-08-26', endTime: '10:00', isAllDay: false,
}).ok === false, 'tanggal invalid ditolak tanpa crash');

// ── normalizeRepeatCount ─────────────────────────────────────────────────────
assert.equal(normalizeRepeatCount('2'), 2, 'interval 2 dipertahankan');
pass++;
assert.equal(normalizeRepeatCount(0), 1, '0 → 1');
assert.equal(normalizeRepeatCount(-3), 1, '-3 → 1');
assert.equal(normalizeRepeatCount(''), 1, 'string kosong → 1');
assert.equal(normalizeRepeatCount('abc'), 1, 'NaN → 1');
assert.equal(normalizeRepeatCount(2.7), 2, 'float di-floor ke integer');
assert.equal(normalizeRepeatCount('10'), 10, 'string angka valid');

console.log(`\nEvent-validation: ${pass + 7} assertions PASS ✅`);
