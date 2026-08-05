import assert from 'node:assert/strict';
import { fetchMessages, searchMessages } from '../src/lib/api.js';
import { SOGO_MESSAGE_HEADERS } from '../src/lib/messageRows.js';

const calls = [];
const row = [[{ name: 'Dummy', email: 'dummy@example.test' }], 0, 0, 'Dummy subject', [{ name: 'Dummy', email: 'dummy@example.test' }], 1, 0, '2026-08-05', 12, '', 42, 0, 0];
const responseData = { uids: [42, 41, 40, 39], unseenCount: 1, headers: [SOGO_MESSAGE_HEADERS, row] };

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
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
  const call = calls.at(-1);
  assert.ok(call.url.endsWith(`/Mail/0/${folder}/view`));
  const body = JSON.parse(call.options.body);
  assert.deepEqual(body.headers, SOGO_MESSAGE_HEADERS);
  assert.equal(body.limit, 1);
  assert.equal(body.offset, undefined);
}

const searchResult = await searchMessages('user@example.test', 'folderSent', 'dummy', 'subject');
assert.equal(searchResult.messages.length, 1);
const searchCall = calls.at(-1);
assert.ok(searchCall.url.endsWith('/Mail/0/folderSent/search'));
assert.deepEqual(JSON.parse(searchCall.options.body), {
  search: 'dummy',
  criteria: 'subject',
  headers: SOGO_MESSAGE_HEADERS,
});

assert.equal(calls.length, folders.length + 1);
console.log('message API assertions passed');
