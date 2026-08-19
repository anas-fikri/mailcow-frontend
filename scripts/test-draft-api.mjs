import assert from 'node:assert/strict';
import { createDraft, saveDraft, deleteDraft, sendMessage } from '../src/lib/api.js';

const calls = [];
const draftJson = { draftId: 'draft-123' };
const saveJson = { uid: 99 };
let sendStatus = 200;

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, options });
  if (u.endsWith('/Mail/0/compose')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => draftJson };
  }
  if (u.endsWith('/folderDrafts/draft-123/save')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => saveJson };
  }
  if (u.endsWith('/folderDrafts/draft-123/send')) {
    return { status: sendStatus, ok: sendStatus < 400, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
  }
  if (u.endsWith('/folderDrafts/batchDelete')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
  }
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
};

// createDraft returns the SOGo draftId
const draftId = await createDraft('user@example.test');
assert.equal(draftId, 'draft-123');

// saveDraft POSTs recipients as an array
const uid = await saveDraft('user@example.test', 'draft-123', {
  to: 'a@example.test, b@example.test',
  cc: '',
  bcc: '',
  subject: 'Hello',
  body: '<p>Hi</p>',
  isHTML: true,
  from: '',
});
assert.equal(uid, 99);
const saveCall = calls.find((c) => c.url.endsWith('/save'));
assert.equal(saveCall.options.method, 'POST');
const saveBody = JSON.parse(saveCall.options.body);
assert.deepEqual(saveBody.to, ['a@example.test', 'b@example.test']);
assert.equal(saveBody.isHTML, true);

// sendMessage — SOGo success path
const sendRes = await sendMessage('user@example.test', {
  to: 'a@example.test', cc: '', bcc: '', subject: 'Hi', body: '<p>x</p>', isHTML: true, from: '',
}, null);
assert.deepEqual(sendRes, { ok: true });
const sendCall = calls.find((c) => c.url.endsWith('/send'));
assert.equal(sendCall.options.method, 'POST');

// deleteDraft with a uid → batchDelete
calls.length = 0;
await deleteDraft('user@example.test', 99);
assert.equal(calls.length, 1);
assert.ok(calls[0].url.endsWith('/folderDrafts/batchDelete'));
assert.deepEqual(JSON.parse(calls[0].options.body), { uids: [99] });

// deleteDraft without uid → no-op
calls.length = 0;
await deleteDraft('user@example.test', null);
assert.equal(calls.length, 0);

console.log('draft API assertions passed');
