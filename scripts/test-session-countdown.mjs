import assert from 'node:assert/strict';
import { formatRemaining, sessionWarningLevel, SHOW_BELOW_MINUTES } from '../src/lib/sessionCountdown.js';

// ── formatRemaining ───────────────────────────────────────────────────────────
assert.equal(formatRemaining(0), '0:00', '0 ms → 0:00');
assert.equal(formatRemaining(-1000), '0:00', 'negatif → 0:00');
assert.equal(formatRemaining(NaN), '0:00', 'NaN → 0:00');
assert.equal(formatRemaining(undefined), '0:00', 'undefined → 0:00');
assert.equal(formatRemaining(45_000), '0:45', '45 detik → 0:45');
assert.equal(formatRemaining(90_000), '1:30', '90 detik → 1:30 (1m30s)');
assert.equal(formatRemaining(14 * 60_000 + 32_000), '14:32', '14m32s → 14:32');
assert.equal(formatRemaining(60 * 60_000), '1:00:00', 'tepat 1 jam → 1:00:00');
assert.equal(formatRemaining(2 * 60 * 60_000 + 5 * 60_000 + 9_000), '2:05:09', '2h5m9s');
assert.equal(formatRemaining(7 * 60 * 60_000), '7:00:00', '7 jam penuh');
assert.equal(formatRemaining(7_999), '0:07', 'sub-detik di-floor');

// ── sessionWarningLevel ──────────────────────────────────────────────────────
assert.equal(sessionWarningLevel(60 * 60_000), 'ok', '60 menit → ok');
assert.equal(sessionWarningLevel(10 * 60_000), 'ok', '10 menit → ok');
assert.equal(sessionWarningLevel(5 * 60_000 + 1), 'ok', 'tepat 5m+1ms → ok');
assert.equal(sessionWarningLevel(5 * 60_000), 'warn', 'tepat 5 menit → warn');
assert.equal(sessionWarningLevel(2 * 60_000), 'warn', '2 menit → warn');
assert.equal(sessionWarningLevel(60_001), 'warn', '60.001 ms → warn');
assert.equal(sessionWarningLevel(60_000), 'urgent', 'tepat 60s → urgent');
assert.equal(sessionWarningLevel(30_000), 'urgent', '30s → urgent');
assert.equal(sessionWarningLevel(0), 'urgent', '0 → urgent');
assert.equal(sessionWarningLevel(-1000), 'urgent', 'negatif → urgent');
assert.equal(sessionWarningLevel(NaN), 'urgent', 'NaN → urgent');

// ── SHOW_BELOW_MINUTES ────────────────────────────────────────────────────────
assert.equal(SHOW_BELOW_MINUTES, 15, 'ambang tampil default = 15 menit');

console.log('session countdown assertions passed');
