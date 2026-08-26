/**
 * Benchmark A/B: biaya getFlagColor di hot path render MailPage.
 *
 * SKENARIO: render daftar pesan — utk SETIAP baris yang terlihat, MailPage
 * memanggil getFlagColor (warna flag) beberapa kali (hasFlag, filter, flag
 * picker, count). Di inbox besar, satu frame scroll me-render ulang 50+ baris.
 *
 * SEBELUM (baseline): setiap getFlagColor membaca + JSON.parse + normalisasi
 * SELURUH store flag dari localStorage (baca sinkron di main thread).
 * SESUDAH: cache in-memory per email — baca localStorage sekali, invalidate
 * saat tulis via API.
 *
 * Ukur: (1) jumlah pembacaan localStorage, (2) throughput getFlagColor/detik,
 * (3) total waktu render-siklus utk N baris × M pemanggilan.
 */
import { performance } from 'node:perf_hooks';

const storage = new Map();
let getItemCalls = 0;
globalThis.localStorage = {
  getItem: (k) => { getItemCalls += 1; return storage.get(k) ?? null; },
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  getFlagColor, setFlagColor, __resetFlagColorCache,
} = await import('../src/lib/flagColors.js');

const EMAIL = 'bench@example.com';

// ── Setup: store flag realistis (10% pesan berflag, warna acak) ──────────────
const COLORS = ['red', 'yellow', 'green', 'blue', 'purple'];
function seedStore(messageCount) {
  for (let uid = 1; uid <= messageCount; uid++) {
    if (uid % 10 === 0) setFlagColor(EMAIL, uid, COLORS[uid % COLORS.length]);
  }
}

// ── Hot path pattern: render list N baris, masing-masing k kali lookup ───────
// (pola MailPage: hasFlag + filter + flag picker render)
function renderCycle(messageCount, lookupsPerRow) {
  let hits = 0;
  for (let uid = 1; uid <= messageCount; uid++) {
    for (let k = 0; k < lookupsPerRow; k++) {
      if (getFlagColor(EMAIL, uid)) hits++;
    }
  }
  return hits;
}

function runBenchmark(messageCount, lookupsPerRow, cycles) {
  const perCycle = messageCount * lookupsPerRow;
  const totalCalls = perCycle * cycles;

  // ── Baseline: cache dikosongkan tiap pemanggilan (perilaku pra-fix) ───────
  __resetFlagColorCache();
  getItemCalls = 0;
  let t0 = performance.now();
  let hits = 0;
  for (let c = 0; c < cycles; c++) {
    __resetFlagColorCache(); // ← sebelum fix: getStore tidak pernah cache
    hits += renderCycle(messageCount, lookupsPerRow);
  }
  const baseMs = performance.now() - t0;
  const baseReads = getItemCalls;

  // ── Sesudah: cache aktif ──────────────────────────────────────────────────
  __resetFlagColorCache();
  getItemCalls = 0;
  t0 = performance.now();
  hits = 0;
  for (let c = 0; c < cycles; c++) {
    hits += renderCycle(messageCount, lookupsPerRow);
  }
  const cachedMs = performance.now() - t0;
  const cachedReads = getItemCalls;

  return {
    messageCount, lookupsPerRow, cycles, totalCalls, hits,
    baseMs: baseMs.toFixed(1), cachedMs: cachedMs.toFixed(1),
    baseReads, cachedReads,
    basePerSec: Math.round(totalCalls / (baseMs / 1000)),
    cachedPerSec: Math.round(totalCalls / (cachedMs / 1000)),
  };
}

console.log('═ Benchmark getFlagColor hot path (modul asli flagColors.js) ═\n');

const scenarios = [
  { rows: 50, lookupsPerRow: 2, cycles: 120 },   // inbox tampil 50 baris, 2 lookup/baris, 120 frame
  { rows: 100, lookupsPerRow: 3, cycles: 60 },   // 100 baris, 3 lookup (hasFlag+filter+count)
  { rows: 200, lookupsPerRow: 2, cycles: 60 },   // inbox besar ter-scroll, 2 lookup/baris
];

for (const s of scenarios) {
  seedStore(s.rows * 3); // store berisi ±3× baris yang tampil (flag lama menumpuk)
  const r = runBenchmark(s.rows, s.lookupsPerRow, s.cycles);
  const readReduction = r.baseReads === 0 ? 0 : Math.round((1 - r.cachedReads / r.baseReads) * 100);
  console.log(`┌ Skenario: ${r.messageCount} baris × ${r.lookupsPerRow} lookup × ${r.cycles} siklus (= ${r.totalCalls.toLocaleString()} panggilan)`);
  console.log(`│ SEBELUM (tanpa cache) : ${r.baseMs} ms  (${r.baseReads.toLocaleString()} baca localStorage, ${r.basePerSec.toLocaleString()}/dtk)`);
  console.log(`│ SESUDAH (dgn cache)   : ${r.cachedMs} ms  (${r.cachedReads.toLocaleString()} baca localStorage, ${r.cachedPerSec.toLocaleString()}/dtk)`);
  console.log(`│ Penghematan: ${Math.round((1 - r.cachedMs / r.baseMs) * 100)}% waktu · ${readReduction}% baca localStorage`);
  console.log('└────────────────────────────────────────────────────────────────\n');
}

// ── Satu siklus render tipikal (50 baris × 2 lookup) — angka absolut ────────
const one = runBenchmark(50, 2, 1);
console.log('Satu siklus render tipikal (50 baris × 2 lookup):');
console.log(`  SEBELUM: ${one.baseMs} ms (${one.baseReads} baca localStorage)`);
console.log(`  SESUDAH: ${one.cachedMs} ms (${one.cachedReads} baca localStorage)`);
