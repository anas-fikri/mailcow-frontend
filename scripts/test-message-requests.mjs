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

// SOGo v5 search = folder view dgn `filters` (endpoint /search tidak ada → 404).
// Diverifikasi dari Mailbox.service.js (SOGo 5.12): $filter → post(id,'view',{filters}).
assert.deepEqual(buildMessageSearchBody('quarterly', 'subject'), {
  sortingAttributes: { sort: 'date', asc: 0 },
  filters: [{ searchBy: 'subject', searchInput: 'quarterly', negative: 0 }],
});
assert.deepEqual(buildMessageSearchBody('a@b.com', 'from'), {
  sortingAttributes: { sort: 'date', asc: 0 },
  filters: [{ searchBy: 'from', searchInput: 'a@b.com', negative: 0 }],
});
assert.deepEqual(buildMessageSearchBody('halo', 'all'), {
  sortingAttributes: { sort: 'date', asc: 0 },
  filters: [{ searchBy: 'contains', searchInput: 'halo', negative: 0 }],
});
assert.deepEqual(buildMessageSearchBody('x', 'to').filters[0].searchBy, 'to');
assert.deepEqual(buildMessageSearchBody('x', 'body').filters[0].searchBy, 'body');
// criteria tidak dikenal → fallback 'contains'
assert.deepEqual(buildMessageSearchBody('x', 'bogus').filters[0].searchBy, 'contains');

console.log('messageRequests assertions passed');
