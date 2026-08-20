import assert from 'node:assert/strict';
import { fetchMessages, fetchMessageHeaders, searchMessages } from '../src/lib/api.js';
import { SOGO_MESSAGE_HEADERS } from '../src/lib/messageRows.js';

const calls = [];
const row = [[{ name: 'Dummy', email: 'dummy@example.test' }], 0, 0, 'Dummy subject', [{ name: 'Dummy', email: 'dummy@example.test' }], 1, 0, '2026-08-05', 12, '', 42, 0, 0];
const responseData = { uids: [42, 41, 40, 39], unseenCount: 1, headers: [SOGO_MESSAGE_HEADERS, row] };

let headersResponse = [SOGO_MESSAGE_HEADERS, row];

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, options });
  if (u.endsWith('/headers')) {
    return {
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => headersResponse,
    };
  }
  return {
    status: 200,
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => responseData,
  };
};

const folders = ['folderINBOX', 'folderSent', 'folderJunk', 'folderTrash'];
for (const folder of folders) {
  const result = await fetchMessages('user@example.test', folder, { limit: 1, offset: 0 });
  assert.equal(result.messages.length, 1);
  assert.equal(result.total, 4);
  assert.deepEqual(result.uids, [42, 41, 40, 39], 'fetchMessages harus kembalikan daftar uids utk pagination');
  const call = calls.at(-1);
  assert.ok(call.url.endsWith(`/Mail/0/${folder}/view`));
  const body = JSON.parse(call.options.body);
  assert.deepEqual(body.headers, SOGO_MESSAGE_HEADERS);
  assert.equal(body.limit, 1);
  assert.equal(body.offset, undefined);
}

// ── fetchMessageHeaders (lazy-load /headers utk auto-load scroll) ───────────
calls.length = 0;
const extra = await fetchMessageHeaders('user@example.test', 'folderINBOX', [40, 39]);
assert.equal(extra.length, 1);
assert.equal(extra[0].uid, 42);
const headersCall = calls.at(-1);
assert.ok(headersCall.url.endsWith('/Mail/0/folderINBOX/headers'), 'harus POST ke /headers');
assert.equal(headersCall.options.method, 'POST');
assert.deepEqual(JSON.parse(headersCall.options.body), { uids: [40, 39] }, 'body harus { uids }');

// uids kosong → langsung [] tanpa fetch
calls.length = 0;
assert.deepEqual(await fetchMessageHeaders('user@example.test', 'folderINBOX', []), []);
assert.equal(calls.length, 0);

const searchResult = await searchMessages('user@example.test', 'folderSent', 'dummy', 'subject');
assert.equal(searchResult.messages.length, 1);
const searchCall = calls.at(-1);
// SOGo v5 search = folder view dgn filters (endpoint /search tidak ada → 404)
assert.ok(searchCall.url.endsWith('/Mail/0/folderSent/view'));
assert.deepEqual(JSON.parse(searchCall.options.body), {
  sortingAttributes: { sort: 'date', asc: 0 },
  filters: [{ searchBy: 'subject', searchInput: 'dummy', negative: 0 }],
});

assert.equal(calls.length, 1, 'searchMessages harus tepat 1 request view (tanpa request ekstra)');
console.log('message API assertions passed');
