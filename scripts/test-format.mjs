// ── Unit test: src/lib/format.js (formatAddresses + getFormatSize) ─────────
// Fokus: formatAddresses harus tahan terhadap bentuk data SOGo yang beragam —
// objek {name,email}, string mentah, null/undefined item, dan non-array.
// Regresi: item null dulu TypeError (Cannot read properties of null) → crash
// seluruh MessageReader; item string menjadi string kosong di daftar alamat.
import assert from 'node:assert';
import { formatAddresses, getFormatSize } from '../src/lib/format.js';

let pass = 0;
const ok = (label) => { pass++; };

// ── formatAddresses ──────────────────────────────────────────────────────────
assert.equal(formatAddresses(null), '', 'null input → kosong'); ok();
assert.equal(formatAddresses(undefined), '', 'undefined input → kosong'); ok();
assert.equal(formatAddresses(''), '', 'string kosong → kosong'); ok();
assert.equal(formatAddresses('a@x.com'), 'a@x.com', 'string input → apa adanya'); ok();

// Objek biasa
assert.equal(
  formatAddresses([{ name: 'Budi', email: 'budi@x.com' }]),
  'Budi <budi@x.com>',
  'objek {name,email} dirangkai Nama <email>'
); ok();

// Item string di dalam array (SOGo kadang kirim array string)
assert.equal(
  formatAddresses(['user@x.com', 'a@b.co']),
  'user@x.com, a@b.co',
  'item string dipertahankan (bukan string kosong)'
); ok();

// Item null di tengah array — regresi: dulu TypeError crash
assert.equal(
  formatAddresses([null, { name: 'B', email: 'b@x.com' }]),
  'B <b@x.com>',
  'item null dilewati tanpa crash'
); ok();

// Campuran: objek tanpa email, string, null
assert.equal(
  formatAddresses([{ name: 'Solo Name' }, 'raw@x.com', null, undefined]),
  'Solo Name, raw@x.com',
  'objek tanpa email → name saja; null/undefined dilewati'
); ok();

// Non-array (mis. object biasa) → String() defensif
assert.equal(formatAddresses({}), '[object Object]', 'non-array → String() defensif (tidak crash)'); ok();

// Array kosong
assert.equal(formatAddresses([]), '', 'array kosong → kosong'); ok();

// ── getFormatSize (regresi cepat) ────────────────────────────────────────────
assert.equal(getFormatSize(0), '0.0 B', '0 byte → 0.0 B'); ok();
assert.equal(getFormatSize(null), '', 'null → kosong'); ok();
assert.equal(getFormatSize(1024), '1.0 KB', '1024 → 1.0 KB'); ok();
assert.equal(getFormatSize('512'), '512 B', 'string numerik diterima'); ok();

console.log(`format assertions passed (${pass} checks)`);
