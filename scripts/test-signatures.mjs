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
// Simulasikan data lama di localStorage: entri tanpa html, entri dgn html bukan
// string, entri id non-string, dan non-object — semua harus dinormalisasi.
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
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-1'), { id: 'legacy-1', name: 'Lama', html: '' });
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-2'), { id: 'legacy-2', name: 'Angka', html: '' });
assert.deepEqual(clean.list.find((s) => s.id === 'legacy-3'), { id: 'legacy-3', name: 'Tanpa Nama', html: '<b>B</b>' });
assert.equal(clean.defaults.new, 'legacy-1');
assert.equal(clean.defaults.reply, 'legacy-3');
// Semua consumer aman: html selalu string
for (const s of clean.list) assert.equal(typeof s.html, 'string');

console.log('signatures assertions passed');
