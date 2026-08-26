import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  parseRecipientEntry, recordSentRecipients, getEmailHistory, getEmailSuggestions,
} = await import('../src/lib/emailHistory.js');

const EMAIL = 'u@example.com';
const KEY = `pcp_emailHistory_${EMAIL}`; // key v1 (versi 1 tidak memakai suffix _vN)

// ── parseRecipientEntry ───────────────────────────────────────────────────────
assert.deepEqual(parseRecipientEntry('a@b.com'), { email: 'a@b.com', name: '' });
assert.deepEqual(parseRecipientEntry('  Budi <Budi@b.com>  '), { email: 'budi@b.com', name: 'Budi' });
assert.deepEqual(parseRecipientEntry('"Nama Panjang" <n@b.com>'), { email: 'n@b.com', name: 'Nama Panjang' });
assert.equal(parseRecipientEntry(''), null);
assert.equal(parseRecipientEntry('bukan-email'), null);
assert.equal(parseRecipientEntry('a@b.com, c@d.com'), null, 'satu entri saja, bukan daftar');
// Karakter kontrol ditolak (emailValidation.recipientAddress)
assert.equal(parseRecipientEntry('a@b.com\nX-Spam: yes'), null);

// ── recordSentRecipients: rekam to/cc/bcc + normalisasi ──────────────────────
storage.clear();
recordSentRecipients(' U@EXAMPLE.COM ', 'Budi <Budi@b.com>, c@d.com', 'Eka <eka@e.com>');
const list1 = getEmailHistory(EMAIL);
assert.equal(list1.length, 3);
assert.deepEqual(list1.map((e) => e.email).sort(), ['budi@b.com', 'c@d.com', 'eka@e.com']);
assert.equal(list1.find((e) => e.email === 'budi@b.com').name, 'Budi');
// Urutan: lastUsed terbaru dulu (timestamp eksplisit — bukan andalan jam).
storage.set(KEY, JSON.stringify([
  { email: 'lama@x.com', name: '', lastUsed: 100 },
  { email: 'baru@x.com', name: 'Baru', lastUsed: 300 },
  { email: 'tengah@x.com', name: '', lastUsed: 200 },
]));
assert.deepEqual(getEmailHistory(EMAIL).map((e) => e.email), ['baru@x.com', 'tengah@x.com', 'lama@x.com']);

// Idempotent: kirim ulang alamat sama → update lastUsed, bukan duplikat
storage.clear();
recordSentRecipients(EMAIL, 'Budi <Budi@b.com>');
recordSentRecipients(EMAIL, 'budi@b.com, Budi <Budi@b.com>, c@d.com');
const list2 = getEmailHistory(EMAIL);
assert.equal(list2.length, 2, 'alamat duplikat tidak boleh dobel');
assert.deepEqual(list2.map((e) => e.email).sort(), ['budi@b.com', 'c@d.com']);
assert.equal(list2.find((e) => e.email === 'budi@b.com').name, 'Budi', 'nama dari kiriman pertama dipertahankan');

// Tanpa akun / tanpa penerima → no-op tanpa error
recordSentRecipients('', 'a@b.com');
recordSentRecipients(EMAIL, '');
assert.deepEqual(getEmailHistory(''), []);
assert.deepEqual(getEmailHistory('orang-lain@x.com'), []);

// ── getEmailSuggestions: kontak + riwayat, dedup, skor ───────────────────────
storage.clear();
recordSentRecipients(EMAIL, 'Rina <rina@x.com>');
const contacts = [
  { name: 'Ana', email: 'ana@x.com' },
  { name: 'Budi', email: 'budi@x.com' },
  { email: 'riwayat@x.com' }, // kontak tanpa nama — alamat tetap bisa dedup
];
const sugg = getEmailSuggestions(EMAIL, contacts, 'ri');
assert.ok(sugg.length >= 2, 'riwayat + kontak digabung (rina + riwayat@)');
assert.ok(sugg.some((s) => s.email === 'rina@x.com'), 'riwayat terkirim muncul di saran');
assert.ok(sugg.some((s) => s.email === 'riwayat@x.com'), 'kontak tetap muncul');
const histEntry = sugg.find((s) => s.email === 'rina@x.com');
assert.equal(histEntry.name, 'Rina', 'nama riwayat dipakai utk entri riwayat');

// Query 1 karakter → tidak ada (min 2)
assert.deepEqual(getEmailSuggestions(EMAIL, contacts, 'r'), []);

// Urutan skor: prefix email > prefix nama
const ranked = getEmailSuggestions(EMAIL, contacts, 'bu');
assert.ok(ranked.length >= 1);
assert.equal(ranked[0].email, 'budi@x.com', 'prefix nama/kontak menang');

// Tanpa kontak → riwayat saja tetap jalan
const histOnly = getEmailSuggestions(EMAIL, [], 'ri');
assert.deepEqual(histOnly, [{ name: 'Rina', email: 'rina@x.com' }]);

// ── Bentuk rusak di storage ditoleransi ──────────────────────────────────────
storage.clear();
storage.set(KEY, 'not-json');
assert.deepEqual(getEmailHistory(EMAIL), []);
storage.set(KEY, JSON.stringify([null, 42, { email: 'ok@x.com', name: 'Ok' }, { email: 'nope' }]));
const list3 = getEmailHistory(EMAIL);
assert.equal(list3.length, 1);
assert.equal(list3[0].email, 'ok@x.com');

// ── Cap MAX_ENTRIES (200) ─────────────────────────────────────────────────────
storage.clear();
const many = Array.from({ length: 250 }, (_, i) => `user${i}@x.com`).join(', ');
recordSentRecipients(EMAIL, many);
assert.equal(getEmailHistory(EMAIL, '', 500).length, 200, 'cap 200 entri');
assert.equal(JSON.parse(storage.get(KEY)).length, 200, 'storage tidak melebihi 200');

console.log('emailHistory assertions passed');
