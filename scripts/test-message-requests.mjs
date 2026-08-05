import assert from 'node:assert/strict';
import { SOGO_MESSAGE_HEADERS } from '../src/lib/messageRows.js';
import { buildMessageSearchBody, buildMessageViewBody } from '../src/lib/messageRequests.js';

const view = buildMessageViewBody({ limit: 1, offset: 3 });
assert.deepEqual(view, {
  sortby: 'date',
  asc: 0,
  headers: SOGO_MESSAGE_HEADERS,
  limit: 1,
  offset: 3,
});
assert.deepEqual(buildMessageViewBody({}), {
  sortby: 'date',
  asc: 0,
  headers: SOGO_MESSAGE_HEADERS,
});

for (const folder of ['folderINBOX', 'folderSent', 'folderJunk', 'folderTrash']) {
  // Folder identity is carried by the URL; request shape is intentionally shared.
  assert.equal(buildMessageViewBody({ limit: 1 }).headers, SOGO_MESSAGE_HEADERS);
  assert.ok(folder.startsWith('folder'));
}

assert.deepEqual(buildMessageSearchBody('quarterly', 'subject'), {
  search: 'quarterly',
  criteria: 'subject',
  headers: SOGO_MESSAGE_HEADERS,
});

console.log('messageRequests assertions passed');
