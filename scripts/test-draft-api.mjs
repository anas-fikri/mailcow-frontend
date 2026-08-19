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
  if (u.endsWith('/api/send')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
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

// sendMessage — SOGo 501 → fallback ke SMTP /api/send (tanpa throw).
sendStatus = 501;
calls.length = 0;
const fallbackRes = await sendMessage('user@example.test', {
  to: 'a@example.test', cc: '', bcc: '', subject: 'Hi', body: '<p>x</p>', isHTML: true, from: '',
}, 'smtp-token-0123456789abcdef0123456789abcdef');
assert.deepEqual(fallbackRes, { ok: true });
const smtpCall = calls.find((c) => c.url.endsWith('/api/send'));
assert.ok(smtpCall, '501 harus memicu fallback /api/send');
assert.equal(smtpCall.options.method, 'POST');

// sendMessage — SOGo 500 → TIDAK fallback (cegah kirim ganda), harus throw.
sendStatus = 500;
calls.length = 0;
let threw = null;
try {
  await sendMessage('user@example.test', {
    to: 'a@example.test', cc: '', bcc: '', subject: 'Hi', body: '<p>x</p>', isHTML: true, from: '',
  }, 'smtp-token-0123456789abcdef0123456789abcdef');
} catch (e) {
  threw = e;
}
assert.ok(threw, 'SOGo 500 harus throw, bukan fallback ke SMTP');
assert.match(threw.message, /500/);
assert.equal(calls.some((c) => c.url.endsWith('/api/send')), false, '500 tidak boleh memicu /api/send');

// reset untuk test deleteDraft
sendStatus = 200;

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
