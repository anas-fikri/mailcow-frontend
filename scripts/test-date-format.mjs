// ── Unit test: src/lib/dateFormat.js ─────────────────────────────────────────
// REGRESI: toISOString() (UTC) dipakai utk tanggal LOKAL → di timezone timur
// UTC (WIB +7) jam dini hari (00:00–06:59) menghasilkan tanggal KEMARIN:
//   - klik sel kalender (midnight lokal) mengisi tanggal sebelumnya di modal
//   - edit event jam 02:00 → tersimpan sehari lebih awal
//   - drag & drop ke slot dini hari → mendarat di hari sebelumnya
// Fix: toLocalDateStr/toLocalTimeStr memakai komponen getFullYear/getHours
// (selalu lokal) — konsisten dengan toTimeString() yang sudah dipakai.
import assert from 'node:assert/strict';

// Set TZ SEBELUM memakai Date apa pun (Node menghormati TZ runtime di Linux).
process.env.TZ = 'Asia/Jakarta';

const { toLocalDateStr, toLocalTimeStr } = await import('../src/lib/dateFormat.js');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── WIB (UTC+7): jam dini hari harus tetap tanggal yang sama ────────────────
// 02:00 WIB = 19:00 UTC hari SEBELUMNYA → toISOString salah (kemarin).
const early = new Date(2026, 7, 26, 2, 0, 0); // 26 Agu 2026 02:00 WIB
assert.equal(toLocalDateStr(early), '2026-08-26', '02:00 WIB → 2026-08-26 (bukan 25)');
pass++;
assert.equal(toLocalTimeStr(early), '02:00', 'jam tetap 02:00');
pass++;

// Midnight (00:00) — sel kalender yang diklik → tanggal SAMA HARI.
const midnight = new Date(2026, 7, 26, 0, 0, 0);
assert.equal(toLocalDateStr(midnight), '2026-08-26', 'midnight WIB → 2026-08-26 (regresi sel kalender)');
pass++;

// 23:59 malam → tetap hari yang sama.
const late = new Date(2026, 7, 26, 23, 59, 0);
assert.equal(toLocalDateStr(late), '2026-08-26', '23:59 WIB → 2026-08-26');
pass++;
assert.equal(toLocalTimeStr(late), '23:59', 'jam 23:59');
pass++;

// ── Timezone barat UTC (America/New_York): malam lokal = UTC besok ──────────
process.env.TZ = 'America/New_York';
const evening = new Date(2026, 7, 26, 23, 30, 0); // 23:30 EDT = 03:30 UTC besok
assert.equal(toLocalDateStr(evening), '2026-08-26', '23:30 New York → 2026-08-26 (bukan 27)');
pass++;
assert.equal(toLocalTimeStr(evening), '23:30', 'jam 23:30');
pass++;

// ── Terima angka (unix ms) — pola pemanggilan EventModal view mode ──────────
process.env.TZ = 'Asia/Jakarta';
const ms = new Date(2026, 7, 26, 2, 0, 0).getTime();
assert.equal(toLocalDateStr(ms), '2026-08-26', 'input unix ms → tanggal lokal benar');
pass++;

// ── Guard input invalid → '' (tidak melempar) ────────────────────────────────
assert.equal(toLocalDateStr(null), '', 'null → kosong');
assert.equal(toLocalDateStr(new Date('invalid')), '', 'Date invalid → kosong');
assert.equal(toLocalTimeStr(undefined), '', 'undefined → kosong');
pass += 3;

console.log(`\ndateFormat: ${pass} assertions PASS ✅`);
