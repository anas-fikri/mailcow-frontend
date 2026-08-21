import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  loadSignatures, addSignature, updateSignature, removeSignature,
  setDefaultSignature, getSignatureFor, getSignatureById,
  LEGACY_PLACEHOLDER,
} = await import('../src/lib/signatures.js');

// Empty state
assert.deepEqual(loadSignatures('u@example.com'), { list: [], defaults: { new: null, reply: null } });

// addSignature auto-defaults both modes
const a = addSignature(' U@Example.COM ', 'Kantor', '<b>Halo</b>');
assert.equal(a.name, 'Kantor');
assert.equal(loadSignatures('u@example.com').list.length, 1);
assert.equal(loadSignatures('u@example.com').defaults.new, a.id);
assert.equal(loadSignatures('u@example.com').defaults.reply, a.id);
assert.deepEqual(getSignatureFor('u@example.com', 'new'), { id: a.id, name: 'Kantor', html: '<b>Halo</b>' });

// Second signature must not override existing defaults
const b = addSignature('u@example.com', 'Pribadi', '--<br>Pribadi');
assert.equal(loadSignatures('u@example.com').defaults.new, a.id);

// updateSignature
const updated = updateSignature('u@example.com', b.id, { name: 'Pribadi 2' });
assert.equal(updated.name, 'Pribadi 2');
assert.equal(getSignatureById('u@example.com', b.id).name, 'Pribadi 2');

// setDefaultSignature + getSignatureFor(reply)
setDefaultSignature('u@example.com', 'reply', b.id);
assert.deepEqual(getSignatureFor('u@example.com', 'reply'), { id: b.id, name: 'Pribadi 2', html: '--<br>Pribadi' });

// removeSignature re-assigns the default to the first remaining
removeSignature('u@example.com', b.id);
assert.equal(loadSignatures('u@example.com').list.length, 1);
assert.equal(loadSignatures('u@example.com').defaults.reply, a.id);

// getSignatureById: missing / falsy id
assert.equal(getSignatureById('u@example.com', 'nope'), null);
assert.equal(getSignatureById('u@example.com', null), null);

// ── Legacy data sanitization (bug: entri tanpa html crash sig.html.length) ──
// Simulasikan data lama di localStorage KEY v1 (legacy): entri tanpa html,
// entri dgn html bukan string, entri id non-string, dan non-object — semua
// harus dinormalisasi + dimigrasi ke key v2 (pcp_signatures_v2_<email>).
storage.clear();
storage.set('pcp_signatures_u@example.com', JSON.stringify({
  list: [
    { id: 'legacy-1', name: 'Lama' },                                  // tanpa html
    { id: 'legacy-2', name: 'Angka', html: 12345 },                    // html bukan string
    { id: 42, name: 'IdAngka' },                                       // id non-string → dibuang
    'bukan-object',                                                    // non-object → dibuang
    { id: 'legacy-3', html: '<b>B</b>' },                              // tanpa name → 'Tanpa Nama'
  ],
  defaults: { new: 'legacy-1', reply: 'legacy-3' },
}));
const clean = loadSignatures('u@example.com');
assert.equal(clean.list.length, 3, 'hanya entri valid yg tersisa');
// Entri legacy (tanpa html / html bukan string) → placeholder + flag
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-1'),
  { id: 'legacy-1', name: 'Lama', html: LEGACY_PLACEHOLDER, placeholder: true });
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-2'),
  { id: 'legacy-2', name: 'Angka', html: LEGACY_PLACEHOLDER, placeholder: true });
// Entri dengan html string → tidak berubah, tanpa flag
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-3'), { id: 'legacy-3', name: 'Tanpa Nama', html: '<b>B</b>' });
assert.equal(clean.defaults.new, 'legacy-1');
assert.equal(clean.defaults.reply, 'legacy-3');
// Semua consumer aman: html selalu string
for (const s of clean.list) assert.equal(typeof s.html, 'string');

// ── Migrasi SEKALI-JALAN: hasil ditulis balik ke KEY v2 + key v1 dihapus ────
const stored = JSON.parse(storage.get('pcp_signatures_v2_u@example.com'));
assert.equal(stored.list.find((s) => s.id === 'legacy-1').html, LEGACY_PLACEHOLDER);
assert.equal(stored.list.find((s) => s.id === 'legacy-1').placeholder, true);
assert.ok(storage.get('pcp_signatures_u@example.com') == null, 'key v1 legacy harus dihapus setelah migrasi');
// Baca kedua: idempotent — placeholder tidak diubah/digandakan, flag bertahan
const rawAfter = storage.get('pcp_signatures_v2_u@example.com');
const clean2 = loadSignatures('u@example.com');
assert.equal(clean2.list.find((s) => s.id === 'legacy-1').html, LEGACY_PLACEHOLDER);
assert.equal(clean2.list.find((s) => s.id === 'legacy-1').placeholder, true);
assert.equal(storage.get('pcp_signatures_v2_u@example.com'), rawAfter, 'tidak ada penulisan ulang saat sudah termigrasi');

// updateSignature: user mengisi html eksplisit → flag placeholder dihapus
const edited = updateSignature('u@example.com', 'legacy-1', { name: 'Lama', html: '<b>Dijisi</b>' });
assert.equal(edited.html, '<b>Dijisi</b>');
assert.equal(edited.placeholder, undefined, 'flag placeholder harus hilang setelah user mengisi');
assert.equal(loadSignatures('u@example.com').list.find((s) => s.id === 'legacy-1').placeholder, undefined);

// ── Kontrak konsumen: getSignatureFor mengembalikan entri placeholder dgn flag ──
// Konsumen (ComposeModal auto-inject / SignaturePicker) WAJIB skip entri
// ber-flag placeholder agar placeholder tidak ikut terkirim. Data ditaruh di
// key v2 langsung (sudah termigrasi).
storage.clear();
storage.set('pcp_signatures_v2_u@example.com', JSON.stringify({
  list: [{ id: 'legacy-1', name: 'Lama' }, { id: 'real-1', name: 'Nyata', html: '<b>B</b>' }],
  defaults: { new: 'legacy-1', reply: 'real-1' },
}));
const viaFor = getSignatureFor('u@example.com', 'new');
assert.equal(viaFor.id, 'legacy-1');
assert.equal(viaFor.placeholder, true, 'konsumen harus bisa mendeteksi placeholder via flag');
assert.equal(getSignatureFor('u@example.com', 'reply').placeholder, undefined, 'signature nyata tanpa flag');

console.log('signatures assertions passed');
