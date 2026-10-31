import assert from 'node:assert/strict';
import { sanitizeMessageIdList, buildThreadingHeaders } from '../src/lib/threadingHeaders.js';

// Token valid dipertahankan, invalid dibuang
assert.equal(sanitizeMessageIdList('<a@x.id>'), '<a@x.id>');
assert.equal(sanitizeMessageIdList('bukan-id'), '');
// CRLF = pemisah; token injeksi ("X-Injected:", "1") dibuang, hasil bebas CR/LF.
const injected = sanitizeMessageIdList('<a@x.id>\r\nX-Injected: 1');
assert.equal(injected, '<a@x.id>');
assert.ok(!/[\r\n]/.test(injected), 'hasil tidak boleh memuat CR/LF');
assert.equal(sanitizeMessageIdList('\r\nX-Injected: 1'), '');
assert.equal(sanitizeMessageIdList('<a b@x.id>'), '', 'spasi di dalam token tidak valid');
assert.equal(sanitizeMessageIdList(null), '');
assert.equal(sanitizeMessageIdList(123), '');

// max = token terakhir; duplikat dihapus
assert.equal(sanitizeMessageIdList('<1@x> <2@x> <3@x>', { max: 2 }), '<2@x> <3@x>');
assert.equal(sanitizeMessageIdList('<1@x> <1@x> <2@x>', { max: 50 }), '<1@x> <2@x>');

// buildThreadingHeaders: References selalu memuat In-Reply-To di ujung
assert.deepEqual(buildThreadingHeaders({}), {});
assert.deepEqual(buildThreadingHeaders({ inReplyTo: '<a@x>' }), { inReplyTo: '<a@x>', references: '<a@x>' });
assert.deepEqual(
  buildThreadingHeaders({ inReplyTo: '<b@x>', references: '<a@x>' }),
  { inReplyTo: '<b@x>', references: '<a@x> <b@x>' },
);
assert.deepEqual(
  buildThreadingHeaders({ inReplyTo: '<b@x>', references: '<a@x> <b@x>' }),
  { inReplyTo: '<b@x>', references: '<a@x> <b@x>' },
  'tidak menggandakan In-Reply-To yang sudah ada di References',
);
assert.deepEqual(buildThreadingHeaders({ inReplyTo: 'junk', references: 'junk' }), {});
// Cap 50 token
const many = Array.from({ length: 60 }, (_, i) => `<${i}@x>`).join(' ');
assert.equal(buildThreadingHeaders({ references: many }).references.split(' ').length, 50);

console.log('threadingHeaders: all assertions passed');
