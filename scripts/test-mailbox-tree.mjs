import assert from 'node:assert/strict';
import { flattenMailboxes } from '../src/lib/mailboxTree.js';

// ── Flat response (kasus production — SOGo tanpa children) ──────────────────
// Depth dihitung dari segmen path: "INBOX/Sub" = 1, "INBOX/Sub/Sub2" = 2.
const flat = [
  { name: 'INBOX', path: 'INBOX', type: 'inbox' },
  { name: 'Sent', path: 'Sent', type: 'sent' },
  { name: 'Proyek', path: 'INBOX/Proyek', type: 'folder' },
  { name: '2026', path: 'INBOX/Proyek/2026', type: 'folder' },
];
const flatResult = flattenMailboxes(flat);
assert.deepEqual(flatResult.map((f) => [f.name, f.depth]), [
  ['INBOX', 0],
  ['Sent', 0],
  ['Proyek', 1],
  ['2026', 2],
]);

// folderId meng-encode slash agar aman di URL SOGo.
assert.equal(flatResult[2].id, 'folderINBOX%2FProyek');

// Label dari FOLDER_TYPE_LABELS; tipe tak dikenal memakai mb.name.
assert.equal(flatResult[0].label, 'Kotak Masuk');
assert.equal(flatResult[1].label, 'Terkirim');
assert.equal(flatResult[2].label, 'Proyek');

// ── Nested response (children) — depth sama dgn path-derived ────────────────
const nested = [
  {
    name: 'INBOX', path: 'INBOX', type: 'inbox',
    children: [
      { name: 'Proyek', path: 'INBOX/Proyek', type: 'folder', children: [
        { name: '2026', path: 'INBOX/Proyek/2026', type: 'folder' },
      ] },
    ],
  },
];
assert.deepEqual(flattenMailboxes(nested).map((f) => [f.name, f.depth]), [
  ['INBOX', 0],
  ['Proyek', 1],
  ['2026', 2],
]);

// ── Nested child dengan path relatif (tanpa prefix parent) ───────────────────
// Rekursi `depth + 1` menang — pathDepth 0 tidak boleh menurunkan depth.
const relativeChild = [
  { name: 'INBOX', path: 'INBOX', type: 'inbox', children: [
    { name: 'Sub', path: 'Sub', type: 'folder' },
  ] },
];
assert.deepEqual(flattenMailboxes(relativeChild).map((f) => [f.name, f.depth]), [
  ['INBOX', 0],
  ['Sub', 1],
]);

// ── Input kosong / null-safe ─────────────────────────────────────────────────
assert.deepEqual(flattenMailboxes(null), []);
assert.deepEqual(flattenMailboxes([]), []);
assert.deepEqual(flattenMailboxes(undefined), []);

// ── path hilang → fallback ke name ───────────────────────────────────────────
assert.deepEqual(flattenMailboxes([{ name: 'INBOX' }])[0].depth, 0);
assert.deepEqual(flattenMailboxes([{ name: 'INBOX/Sub' }])[0].depth, 1);

// ── Folder path mengandung nama dengan spasi/karakter lain tetap aman ────────
const spaced = flattenMailboxes([{ name: 'HR Training', path: 'INBOX/HR Training' }]);
assert.equal(spaced[0].depth, 1);
assert.equal(spaced[0].id, 'folderINBOX%2FHR Training');

// ── Normalisasi entri malformed (pola loadSignatures) ───────────────────────
// Entri null / non-object dibuang; path/name non-string di-coerce (String())
// agar .replace/.split tidak crash; entri tanpa path & name dibuang.
const messy = flattenMailboxes([
  null,
  'bukan-object',
  42,
  { path: 'INBOX', name: 'INBOX', type: 'inbox' },
  { path: 12345, name: 'Angka' },              // path number → String(12345)
  { name: null, path: null },                  // tanpa path & name → dibuang
  { name: 'Solo' },                            // tanpa path → pakai name
]);
assert.equal(messy.length, 3, 'hanya 3 entri valid yg tersisa (INBOX, Angka, Solo)');
assert.equal(messy[0].name, 'INBOX');
assert.equal(messy[1].id, 'folder12345');
assert.equal(messy[1].name, 'Angka');
assert.equal(messy[2].id, 'folderSolo');
assert.equal(typeof messy[2].path, 'string');
assert.equal(messy[2].name, 'Solo');
// children bukan array (mis. object) tidak crash
const badChildren = flattenMailboxes([{ path: 'INBOX', name: 'INBOX', children: { INBOX: 'x' } }]);
assert.equal(badChildren.length, 1);

console.log('mailboxTree assertions passed');
