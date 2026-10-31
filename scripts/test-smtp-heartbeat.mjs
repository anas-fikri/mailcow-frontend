import assert from 'node:assert/strict';
import { setupSmtpHeartbeat, SMTP_HEARTBEAT_INTERVAL_MS } from '../src/lib/smtpHeartbeat.js';

let callCount = 0;
const schedule = () => { callCount += 1; };

// Mock setInterval/clearInterval yg mencatat id & delay, serta memanggil
// callback manual (tiap heartbeat fire) lewat `fireTimers()`.
const intervals = [];
function mockSetInterval(fn, ms) {
    const id = { fn, ms, fired: 0 };
    intervals.push(id);
    return id;
}
function mockClearInterval(id) {
    const idx = intervals.indexOf(id);
    if (idx >= 0) intervals.splice(idx, 1);
}
function fireTimers(steps) {
    const n = steps ?? 1;
    const live = [...intervals];
    for (const id of live) {
        id.fired += 1;
        id.fn();
    }
}

// ── 1. initial visible → immediate schedule + interval set ──────────────────
assert.equal(SMTP_HEARTBEAT_INTERVAL_MS, 50 * 60 * 1000, 'interval default 50 menit');

callCount = 0; intervals.length = 0;
let visible = true;
let hb = setupSmtpHeartbeat({
    schedule,
    isVisible: () => visible,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
});
assert.equal(callCount, 1, 'visible saat init → 1 immediate schedule');
assert.equal(hb.isRunning(), true, 'interval aktif');
assert.equal(intervals.length, 1, 'satu interval terdaftar');
assert.equal(intervals[0].ms, SMTP_HEARTBEAT_INTERVAL_MS, 'interval = 50 min');
hb.stop(); // bersihkan utk skenario berikut

// ── 2. initial hidden → tidak schedule, interval tidak set ─────────────────
callCount = 0; intervals.length = 0;
visible = false;
hb = setupSmtpHeartbeat({
    schedule,
    isVisible: () => visible,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
});
assert.equal(callCount, 0, 'hidden saat init → tidak schedule');
assert.equal(hb.isRunning(), false, 'interval tidak aktif saat hidden');
assert.equal(intervals.length, 0, 'tidak ada interval terdaftar');

// ── 3. visible → hidden → interval cleared ────────────────────────────────
callCount = 0; intervals.length = 0;
visible = true;
hb = setupSmtpHeartbeat({
    schedule,
    isVisible: () => visible,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
});
assert.equal(callCount, 1);
assert.equal(hb.isRunning(), true);
visible = false;
hb.onVisibilityChange();
assert.equal(hb.isRunning(), false, 'after hidden transition, stopped');
assert.equal(intervals.length, 0, 'interval cleared');
hb.stop();

// ── 4. hidden → visible → immediate schedule + new interval ───────────────
callCount = 0; intervals.length = 0;
visible = false;
hb = setupSmtpHeartbeat({
    schedule,
    isVisible: () => visible,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
});
assert.equal(callCount, 0);
visible = true;
hb.onVisibilityChange();
assert.equal(callCount, 1, 'resume → immediate schedule');
assert.equal(hb.isRunning(), true);
assert.equal(intervals.length, 1);

// ── 5. start() idempotent — kalau sudah jalan, jangan double-schedule ──────
callCount = 0; intervals.length = 0;
visible = true;
hb = setupSmtpHeartbeat({
    schedule,
    isVisible: () => visible,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
});
const beforeCount = callCount;
hb.start(); // panggil start lagi → harus no-op
assert.equal(callCount, beforeCount, 'start() idempotent');

console.log('smtp-heartbeat: SEMUA SKENARIO PASS');
