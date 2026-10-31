import assert from 'node:assert/strict';
import {
  isSafeEmail, isSafeRecipient, recipientAddress, validateRecipientList, hasControlChars, firstInvalidRecipient,
} from '../src/lib/emailValidation.js';

// ── isSafeEmail ────────────────────────────────────────────────────────────────
assert.equal(isSafeEmail('user@example.com'), true);
assert.equal(isSafeEmail(''), false);
assert.equal(isSafeEmail('no-at-sign'), false);
assert.equal(isSafeEmail('@example.com'), false);   // leading @
assert.equal(isSafeEmail('user@'), false);          // trailing @
assert.equal(isSafeEmail('a@b@c.com'), false);      // double @
assert.equal(isSafeEmail('a b@c.com'), false);      // space
assert.equal(isSafeEmail('<a@b.com>'), false);      // brackets
assert.equal(isSafeEmail('a@b.com\nBcc: x@y.com'), false);   // newline injection
assert.equal(isSafeEmail('a@b.com\r\nX: y'), false);         // CRLF
assert.equal(isSafeEmail('a@b.com\0'), false);               // NUL
assert.equal(isSafeEmail(null), false);
assert.equal(isSafeEmail(undefined), false);

// ── isSafeRecipient ────────────────────────────────────────────────────────────
assert.equal(isSafeRecipient('user@example.com'), true);
assert.equal(isSafeRecipient('John Doe <user@example.com>'), true);
assert.equal(isSafeRecipient('John Doe <user@example.com>\nBcc: evil@x.com'), false);
assert.equal(isSafeRecipient('user@example.com\r\nBcc: evil@x.com'), false);
assert.equal(isSafeRecipient('user@example.com\n'), false); // lone newline
assert.equal(isSafeRecipient('user@example.com\0'), false); // NUL
assert.equal(isSafeRecipient(''), false);
assert.equal(isSafeRecipient(null), false);

// ── recipientAddress ───────────────────────────────────────────────────────────
assert.equal(recipientAddress('user@example.com'), 'user@example.com');
assert.equal(recipientAddress('John Doe <user@Example.COM>'), 'user@example.com');

// ── validateRecipientList ──────────────────────────────────────────────────────
assert.equal(validateRecipientList(''), true);
assert.equal(validateRecipientList(undefined), true);
assert.equal(validateRecipientList('a@b.com'), true);
assert.equal(validateRecipientList('a@b.com, c@d.com'), true);
assert.equal(validateRecipientList('a@b.com, not-an-email'), false);
assert.equal(validateRecipientList('a@b.com\r\nBcc: x@y.com'), false);

// ── hasControlChars ────────────────────────────────────────────────────────────
assert.equal(hasControlChars('hello\nworld'), true);
assert.equal(hasControlChars('hello\r\nworld'), true);
assert.equal(hasControlChars('hello\tworld'), true);
assert.equal(hasControlChars('hello world'), false);
assert.equal(hasControlChars(''), false);
assert.equal(hasControlChars(null), false);

// ── firstInvalidRecipient ──────────────────────────────────────────────────────
assert.equal(firstInvalidRecipient(''), null);
assert.equal(firstInvalidRecipient(null), null);
assert.equal(firstInvalidRecipient('a@b.com'), null);
assert.equal(firstInvalidRecipient('a@b.com, c@d.com'), null);
assert.equal(firstInvalidRecipient('John Doe <a@b.com>, c@d.com'), null);
assert.equal(firstInvalidRecipient('a@b.com, not-an-email'), 'not-an-email');
assert.equal(firstInvalidRecipient('bad@@x.com, a@b.com'), 'bad@@x.com'); // kembalikan yg PERTAMA rusak
assert.equal(firstInvalidRecipient('a@b.com, <evil>@x.com'), '<evil>@x.com');
assert.equal(firstInvalidRecipient('a@b.com, b@c.com\nBcc: evil@x.com'), 'b@c.com\nBcc: evil@x.com');
assert.equal(firstInvalidRecipient('a@b.com,  '), null); // koma + spasi trailing → abaikan

// ── ComposeModal memakai validasi sebelum kirim (static source check) ─────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const compose = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/components/mailer/ComposeModal.jsx'),
  'utf8'
);
assert.ok(compose.includes("firstInvalidRecipient"), 'ComposeModal mengimpor firstInvalidRecipient');
assert.ok(compose.includes('Alamat email tidak valid di'), 'ComposeModal punya pesan error format jelas');
assert.ok(compose.includes("['Kepada', to], ['Cc', cc], ['Bcc', bcc]"), 'ComposeModal memvalidasi to/cc/bcc');

console.log('emailValidation assertions passed (incl. firstInvalidRecipient + ComposeModal guard)');
