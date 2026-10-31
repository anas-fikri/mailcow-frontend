// Unit test: src/lib/mailSelection.js — seleksi ala Outlook (klik / Ctrl+klik /
// Shift+klik), target aksi, navigasi fokus, auto-advance.
// Jalankan: node scripts/test-mail-selection.mjs
import assert from 'node:assert/strict';
import {
  toggleUid, unionUids, removeUids, rangeBetween, resolveRowClick,
  resolveTargetUids, nextFocusIndex, toggleSelectAllUids, nextAfterRemoval,
} from '../src/lib/mailSelection.js';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); pass++; };

// ── primitif ────────────────────────────────────────────────────────────────
eq(toggleUid([1, 2], 3), [1, 2, 3], 'toggle: tambah');
eq(toggleUid([1, 2, 3], 2), [1, 3], 'toggle: lepas');
eq(toggleUid([1, '2'], 2), [1], 'toggle: uid string vs number dianggap sama');
eq(toggleUid(null, 5), [5], 'toggle: list null aman');
eq(unionUids([1, 2], [2, 3]), [1, 2, 3], 'union tanpa duplikat');
eq(removeUids([1, 2, 3, 4], ['2', 4]), [1, 3], 'removeUids campur tipe');
eq(rangeBetween([10, 9, 8, 7, 6], 9, 7), [9, 8, 7], 'range maju');
eq(rangeBetween([10, 9, 8, 7, 6], 7, 9), [9, 8, 7], 'range mundur = sama');
eq(rangeBetween([10, 9, 8], 99, 9), [9], 'anchor tidak ada → hanya uid yang diklik');

// ── resolveRowClick ─────────────────────────────────────────────────────────
const order = [50, 40, 30, 20, 10];
{
  const r = resolveRowClick({ selected: [40, 30], anchor: 40, current: null }, 20, {}, order);
  eq(r, { selected: [], anchor: 20, open: 20 }, 'klik biasa: buka + bersihkan seleksi multi + anchor');
}
{
  const r = resolveRowClick({ selected: [], anchor: null, current: 50 }, 30, { ctrl: true }, order);
  eq(r.selected, [50, 30], 'ctrl+klik dgn seleksi kosong: pesan terbuka ikut terpilih (Outlook)');
  eq(r.open, null, 'ctrl+klik tidak membuka pesan');
  eq(r.anchor, 30, 'ctrl+klik memindahkan anchor');
}
{
  const r = resolveRowClick({ selected: [], anchor: null, current: 30 }, 30, { meta: true }, order);
  eq(r.selected, [30], 'cmd+klik pada pesan yang sedang terbuka: hanya dia (tidak dobel)');
}
{
  const r = resolveRowClick({ selected: [50, 30], anchor: 30, current: 50 }, 30, { ctrl: true }, order);
  eq(r.selected, [50], 'ctrl+klik pada yang sudah terpilih: lepas');
}
{
  const r = resolveRowClick({ selected: [50], anchor: 40, current: null }, 20, { shift: true }, order);
  eq(r.selected, [40, 30, 20], 'shift+klik: rentang anchor→uid MENGGANTI seleksi (Outlook)');
  eq(r.anchor, 40, 'shift+klik tidak memindahkan anchor');
  eq(r.open, null, 'shift+klik tidak membuka');
}
{
  const r = resolveRowClick({ selected: [50], anchor: 40, current: null }, 20, { shift: true, ctrl: true }, order);
  eq(r.selected, [50, 40, 30, 20], 'ctrl+shift+klik: rentang DITAMBAHKAN ke seleksi');
}
{
  const r = resolveRowClick({ selected: [], anchor: null, current: 50 }, 30, { shift: true }, order);
  eq(r.selected, [50, 40, 30], 'shift+klik tanpa anchor memakai pesan terbuka sebagai jangkar');
}
{
  const r = resolveRowClick({ selected: [], anchor: null, current: null }, 30, { shift: true }, order);
  eq(r, { selected: [30], anchor: 30, open: null }, 'shift+klik tanpa jangkar sama sekali → pilih satu');
}
{
  const r = resolveRowClick(undefined, 7, undefined, undefined);
  eq(r, { selected: [], anchor: 7, open: 7 }, 'state/mods/order undefined aman');
}

// ── resolveTargetUids ───────────────────────────────────────────────────────
eq(resolveTargetUids({ selected: [1, 2], focusedUid: 9 }), [1, 2], 'seleksi multi menang');
eq(resolveTargetUids({ selected: [], focusedUid: 9, openUid: 3 }), [9], 'tanpa seleksi → baris fokus');
eq(resolveTargetUids({ selected: [], focusedUid: null, openUid: 3 }), [3], 'tanpa fokus → pesan terbuka');
eq(resolveTargetUids({}), [], 'tidak ada apa-apa → kosong');
eq(resolveTargetUids({ selected: [], focusedUid: 0 }), [0], 'uid 0 tetap valid (bukan falsy-skip)');

// ── nextFocusIndex ──────────────────────────────────────────────────────────
assert.equal(nextFocusIndex(-1, 1, 5), 0, 'belum fokus + turun → 0'); pass++;
assert.equal(nextFocusIndex(-1, -1, 5), 4, 'belum fokus + naik → terakhir'); pass++;
assert.equal(nextFocusIndex(-1, 1, 5, 2), 3, 'fallback (pesan terbuka idx 2) + turun → 3'); pass++;
assert.equal(nextFocusIndex(4, 1, 5), 4, 'mentok bawah'); pass++;
assert.equal(nextFocusIndex(0, -1, 5), 0, 'mentok atas'); pass++;
assert.equal(nextFocusIndex(2, 'home', 5), 0, 'Home'); pass++;
assert.equal(nextFocusIndex(2, 'end', 5), 4, 'End'); pass++;
assert.equal(nextFocusIndex(2, 1, 0), -1, 'daftar kosong → -1'); pass++;

// ── toggleSelectAllUids ─────────────────────────────────────────────────────
eq(toggleSelectAllUids([], [1, 2, 3]), [1, 2, 3], 'pilih semua');
eq(toggleSelectAllUids([1, 2, 3], [1, 2, 3]), [], 'semua sudah terpilih → kosongkan');
eq(toggleSelectAllUids([1], [1, 2, 3]), [1, 2, 3], 'sebagian terpilih → pilih semua');
eq(toggleSelectAllUids([1, 2, 3, 99], [1, 2, 3]), [], 'seleksi superset (uid lama) tetap dianggap semua');
eq(toggleSelectAllUids([], []), [], 'daftar kosong → kosong');

// ── nextAfterRemoval ────────────────────────────────────────────────────────
assert.equal(nextAfterRemoval(order, [30], 30), 20, 'hapus yang terbuka → berikutnya'); pass++;
assert.equal(nextAfterRemoval(order, [30, 20, 10], 30), 40, 'ujung bawah habis → sebelumnya'); pass++;
assert.equal(nextAfterRemoval(order, order, 30), null, 'semua hilang → null'); pass++;
assert.equal(nextAfterRemoval(order, [50], 30), 30, 'yang terbuka tidak dihapus → tetap'); pass++;
assert.equal(nextAfterRemoval(order, [30], null), null, 'tidak ada yang terbuka → null'); pass++;

console.log(`mail-selection: ${pass} assertions PASS`);
