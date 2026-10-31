// Unit test: src/lib/contextMenuPosition.js — clamp/flip menu konteks,
// posisi submenu, navigasi indeks item.
// Jalankan: node scripts/test-context-menu-position.mjs
import assert from 'node:assert/strict';
import { clampMenuPosition, submenuPosition, centerPosition, nextMenuIndex } from '../src/lib/contextMenuPosition.js';

let pass = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); pass++; };
const vp = { viewportWidth: 1000, viewportHeight: 600 };

// ── clampMenuPosition ───────────────────────────────────────────────────────
eq(clampMenuPosition({ x: 100, y: 100, width: 200, height: 300, ...vp }),
  { left: 100, top: 100, flippedX: false, flippedY: false }, 'muat → posisi kursor apa adanya');
eq(clampMenuPosition({ x: 900, y: 100, width: 200, height: 300, ...vp }),
  { left: 700, top: 100, flippedX: true, flippedY: false }, 'mepet kanan → flip ke kiri kursor');
eq(clampMenuPosition({ x: 100, y: 500, width: 200, height: 300, ...vp }),
  { left: 100, top: 200, flippedX: false, flippedY: true }, 'mepet bawah → flip ke atas kursor');
eq(clampMenuPosition({ x: 950, y: 580, width: 200, height: 300, ...vp }),
  { left: 750, top: 280, flippedX: true, flippedY: true }, 'pojok kanan bawah → flip keduanya');
{
  // Terlalu besar utk flip (x - width < margin) → clamp ke tepi kanan.
  const r = clampMenuPosition({ x: 150, y: 10, width: 900, height: 100, ...vp });
  eq(r, { left: 92, top: 10, flippedX: false, flippedY: false }, 'tidak bisa flip → clamp kanan (vw - w - margin)');
}
{
  const r = clampMenuPosition({ x: -50, y: -20, width: 100, height: 100, ...vp });
  eq(r, { left: 8, top: 8, flippedX: false, flippedY: false }, 'koordinat negatif → margin');
}
{
  const r = clampMenuPosition({ x: 10, y: 10, width: 2000, height: 2000, ...vp });
  eq([r.left, r.top], [8, 8], 'menu lebih besar dari viewport → tetap di margin (sisi kiri/atas terlihat)');
}
eq(clampMenuPosition({ x: 40, y: 50, width: 100, height: 100 }),
  { left: 40, top: 50, flippedX: false, flippedY: false }, 'tanpa viewport (0) → tidak clamp');
eq(clampMenuPosition({ x: 'abc', y: null, width: NaN, height: undefined, ...vp }),
  { left: 8, top: 8, flippedX: false, flippedY: false }, 'input tidak valid → margin aman');

// ── submenuPosition ─────────────────────────────────────────────────────────
{
  const r = submenuPosition({ left: 100, top: 200, width: 180, height: 32 }, { width: 160, height: 120 }, { width: 1000, height: 600 });
  eq(r, { left: 278, top: 196, flippedX: false, flippedY: false }, 'submenu di kanan item (overlap 2px, naik 4px)');
}
{
  const r = submenuPosition({ left: 800, top: 200, width: 180, height: 32 }, { width: 160, height: 120 }, { width: 1000, height: 600 });
  eq(r, { left: 642, top: 196, flippedX: true, flippedY: false }, 'tidak muat di kanan → ke kiri item');
}
{
  const r = submenuPosition({ left: 100, top: 560, width: 180, height: 32 }, { width: 160, height: 120 }, { width: 1000, height: 600 });
  eq(r.top, 472, 'submenu mepet bawah → dinaikkan agar muat');
}
{
  const r = submenuPosition(null, null, null);
  eq(r, { left: 8, top: 8, flippedX: false, flippedY: false }, 'input null aman');
}

// ── centerPosition ──────────────────────────────────────────────────────────
eq(centerPosition({ width: 400, height: 300 }, { width: 1000, height: 600 }),
  { left: 300, top: 120, flippedX: false, flippedY: false }, 'center: horizontal tengah, vertikal ~20% dari atas');
eq(centerPosition({ width: 2000, height: 300 }, { width: 1000, height: 600 }).left, 8, 'lebih lebar dari viewport → margin');

// ── nextMenuIndex ───────────────────────────────────────────────────────────
const items = [
  { id: 'a' }, { separator: true }, { id: 'b', disabled: true }, { id: 'c' }, { id: 'd' },
];
assert.equal(nextMenuIndex(items, -1, 1), 0, 'awal + turun → item pertama'); pass++;
assert.equal(nextMenuIndex(items, 0, 1), 3, 'lewati separator & disabled'); pass++;
assert.equal(nextMenuIndex(items, 4, 1), 0, 'wrap ke awal'); pass++;
assert.equal(nextMenuIndex(items, 0, -1), 4, 'naik dari awal → wrap ke akhir'); pass++;
assert.equal(nextMenuIndex(items, 3, -1), 0, 'naik lewati disabled/separator'); pass++;
assert.equal(nextMenuIndex(items, -1, -1), 4, 'awal + naik → item terakhir'); pass++;
assert.equal(nextMenuIndex(items, 4, 'home'), 0, 'Home'); pass++;
assert.equal(nextMenuIndex(items, 0, 'end'), 4, 'End'); pass++;
assert.equal(nextMenuIndex([], 0, 1), -1, 'kosong → -1'); pass++;
assert.equal(nextMenuIndex([{ separator: true }, { disabled: true }], -1, 1), -1, 'semua tidak bisa dipilih → -1'); pass++;

console.log(`context-menu-position: ${pass} assertions PASS`);
