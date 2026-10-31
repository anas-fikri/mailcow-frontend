import assert from 'node:assert/strict';
import {
  isBase64, base64Length, validateAttachment, validateAttachments,
  MAX_ATTACHMENTS, MAX_FILE_BASE64, MAX_FILE_MB_DEFAULT, MAX_TOTAL_MB_DEFAULT,
} from '../src/lib/attachmentValidation.js';

// ── isBase64 ──────────────────────────────────────────────────────────────────
assert.equal(isBase64(''), false);
assert.equal(isBase64('aGVsbG8='), true);
assert.equal(isBase64('aGVsbG8'), true);            // padding opsional
assert.equal(isBase64('aGVsbG8==='), false);        // padding berlebih
assert.equal(isBase64('aGVs!G8='), false);          // karakter ilegal
assert.equal(isBase64('aGVs'), true);
assert.equal(isBase64('aGVsb'), false);             // panjang % 4 === 1 → invalid

// ── base64Length ──────────────────────────────────────────────────────────────
assert.equal(base64Length('aGVsbG8='), 5);          // "hello"
assert.equal(base64Length('aGVs'), 3);
assert.equal(base64Length('aA=='), 1);

// ── validateAttachment ────────────────────────────────────────────────────────
const good = { filename: 'laporan.pdf', contentType: 'application/pdf', data: Buffer.from('hello').toString('base64') };
const r1 = validateAttachment(good);
assert.equal(r1.ok, true);
assert.equal(r1.sanitized.filename, 'laporan.pdf');
assert.equal(r1.sanitized.size, 5);

// nama wajib
assert.equal(validateAttachment({ filename: '  ', contentType: 'application/pdf', data: 'aGVs' }).ok, false);
// nama mengandung path → ditolak (cegah header injection)
assert.equal(validateAttachment({ filename: '../../etc/passwd', contentType: 'text/plain', data: 'aGVs' }).ok, false);
// nama mengandung control char → ditolak
assert.equal(validateAttachment({ filename: 'a\u0000b.txt', contentType: 'text/plain', data: 'aGVs' }).ok, false);
// contentType tidak valid
assert.equal(validateAttachment({ ...good, contentType: 'application/; x' }).ok, false);
// data bukan base64
assert.equal(validateAttachment({ ...good, data: '!!!not-base64!!!' }).ok, false);
// data melebihi batas file (string base64 valid, len % 4 === 0)
const tooBig = validateAttachment({ ...good, data: 'QUJD'.repeat(Math.ceil((MAX_FILE_BASE64 + 1) / 4)) });
assert.equal(tooBig.ok, false);
assert.match(tooBig.error, /20 MB/);

// ── validateAttachments ───────────────────────────────────────────────────────
assert.deepEqual(validateAttachments([]), { ok: true, sanitized: [] });
assert.deepEqual(validateAttachments(undefined), { ok: true, sanitized: [] });
assert.deepEqual(validateAttachments(null), { ok: true, sanitized: [] });

const list = validateAttachments([good, { filename: 'foto.png', contentType: 'image/png', data: 'aGVsbG8=' }]);
assert.equal(list.ok, true);
assert.equal(list.sanitized.length, 2);
assert.equal(list.sanitized[1].filename, 'foto.png');

// terlalu banyak lampiran
const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({
  filename: `f${i}.txt`, contentType: 'text/plain', data: 'aA==',
}));
const rMany = validateAttachments(many);
assert.equal(rMany.ok, false);
assert.match(rMany.error, /Maksimal/);

// total melebihi batas
const fat = [
  { filename: 'a.bin', contentType: 'application/octet-stream', data: 'A'.repeat(MAX_FILE_BASE64) },
  { filename: 'b.bin', contentType: 'application/octet-stream', data: 'A'.repeat(MAX_FILE_BASE64) },
  { filename: 'c.bin', contentType: 'application/octet-stream', data: 'A'.repeat(MAX_FILE_BASE64) },
  { filename: 'd.bin', contentType: 'application/octet-stream', data: 'A'.repeat(MAX_FILE_BASE64) },
  { filename: 'e.bin', contentType: 'application/octet-stream', data: 'A'.repeat(MAX_FILE_BASE64) },
];
const rFat = validateAttachments(fat);
assert.equal(rFat.ok, false);
assert.match(rFat.error, /60 MB/);

// Batas env override: server.js bisa set nilai berbeda (mis. 25 MB/file).
const rOverride = validateAttachment(
  { ...good, data: 'QUJD'.repeat(Math.ceil((26 * 1024 * 1024 * 4 / 3 + 1) / 4)) },
  0,
  { maxFileBase64: Math.floor(25 * 1024 * 1024 * 4 / 3) + 1024, maxFileMB: 25 }
);
assert.equal(rOverride.ok, false);
assert.match(rOverride.error, /25 MB/);
// default ekspor tetap 20 MB per file
assert.equal(MAX_FILE_MB_DEFAULT, 20);
assert.equal(MAX_TOTAL_MB_DEFAULT, 60);

// error pertama menunjuk index yang benar
const mixed = [good, { filename: '', contentType: 'text/plain', data: 'aA==' }];
const rMixed = validateAttachments(mixed);
assert.equal(rMixed.ok, false);
assert.match(rMixed.error, /#2/);

console.log('attachment validation assertions passed');
