// ── Unit test: src/lib/api.js — threading header, timeout, bulk flag, viewsource ──
// Jalankan: node scripts/test-reader-api.mjs
import assert from 'node:assert/strict';

// localStorage stub: hitung bump versi crossTab domain 'mail'.
let bumpCount = 0;
globalThis.localStorage = {
  _s: new Map(),
  getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
  setItem(k, v) { if (String(k).includes('mail')) bumpCount++; this._s.set(k, String(v)); },
  removeItem(k) { this._s.delete(k); },
};

const {
  sendMessage, saveDraft, markRead, markFlagged, markReadBulk, markFlaggedBulk,
  fetchMessage, fetchMessageHeaders, searchMessages, fetchMessageHeadersRaw,
} = await import('../src/lib/api.js');

let pass = 0;
const ok = (cond, msg = 'assertion') => { assert.ok(cond, msg); pass++; };
const eq = (a, b, msg = '') => { assert.equal(a, b, msg || `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); pass++; };

const calls = [];
let inFlight = 0;
let maxInFlight = 0;
let failUids = new Set();
let viewsourceBody = null;
const jsonRes = (data, status = 200) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: () => 'application/json' },
  json: async () => data, text: async () => JSON.stringify(data),
});
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, options });
  if (u.endsWith('/compose')) return jsonRes({ draftId: 'd1' });
  if (u.endsWith('/send') && u.includes('/folderDrafts/')) return jsonRes({ ok: true });
  if (u.endsWith('/api/send')) return jsonRes({ ok: true, messageId: 'm' });
  if (u.endsWith('/save')) return jsonRes({ uid: 5 });
  if (/\/(markMessageRead|markMessageUnread|markFlagged|markUnflagged)$/.test(u)) {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    const uid = Number(u.split('/').at(-2));
    return failUids.has(uid) ? jsonRes({}, 500) : jsonRes({});
  }
  if (u.endsWith('/viewsource')) return viewsourceBody;
  if (u.endsWith('/headers')) return jsonRes([]);
  if (u.endsWith('/view')) return jsonRes({ subject: 'x', uids: [], headers: [] });
  return jsonRes({});
};

// ── sendMessage: inReplyTo/references diteruskan (SOGo /send) ────────────────
calls.length = 0;
await sendMessage('u@x.id', { to: 'a@x.id', subject: 's', body: '<p>b</p>', inReplyTo: '<m@x.id>', references: '<r@x.id> <m@x.id>' });
{
  const send = calls.find((c) => c.url.includes('/folderDrafts/') && c.url.endsWith('/send'));
  ok(send, 'jalur SOGo /send dipakai');
  const body = JSON.parse(send.options.body);
  eq(body.inReplyTo, '<m@x.id>', 'inReplyTo diteruskan ke SOGo');
  eq(body.references, '<r@x.id> <m@x.id>', 'references diteruskan ke SOGo');
}
// tanpa field → string kosong (kompatibel payload lama)
calls.length = 0;
await sendMessage('u@x.id', { to: 'a@x.id', subject: 's', body: 'b' });
{
  const body = JSON.parse(calls.find((c) => c.url.endsWith('/send')).options.body);
  eq(body.inReplyTo, ''); eq(body.references, '');
}
// token tidak valid dibuang (anti header injection), duplikat dibuang
calls.length = 0;
await sendMessage('u@x.id', { to: 'a@x.id', subject: 's', body: 'b', inReplyTo: 'bukan-token\r\nX-Evil: 1', references: '<a@x> <a@x> <b@y>\nX-Evil: 1' });
{
  const body = JSON.parse(calls.find((c) => c.url.endsWith('/send')).options.body);
  eq(body.inReplyTo, '', 'nilai bukan <id@host> dibuang');
  eq(body.references, '<a@x> <b@y>', 'hanya token valid, tanpa duplikat');
}
// jalur SMTP (/api/send) — ada lampiran → header ikut di JSON body
calls.length = 0;
await sendMessage('u@x.id', { to: 'a@x.id', subject: 's', body: 'b', inReplyTo: '<m@x.id>', references: '<m@x.id>', attachments: [{ filename: 'a.txt', contentType: 'text/plain', data: 'QQ==' }] });
{
  const smtp = calls.find((c) => c.url.endsWith('/api/send'));
  ok(smtp, 'lampiran → /api/send');
  const body = JSON.parse(smtp.options.body);
  eq(body.inReplyTo, '<m@x.id>', '/api/send membawa inReplyTo');
  eq(body.references, '<m@x.id>', '/api/send membawa references');
}

// ── saveDraft ────────────────────────────────────────────────────────────────
calls.length = 0;
await saveDraft('u@x.id', 'd1', { to: 'a@x.id', subject: 's', body: 'b', inReplyTo: '<m@x.id>', references: '<r@x.id>' });
{
  const body = JSON.parse(calls.find((c) => c.url.endsWith('/save')).options.body);
  eq(body.inReplyTo, '<m@x.id>', 'draft membawa inReplyTo');
  eq(body.references, '<r@x.id>', 'draft membawa references');
}

// ── Timeout: AbortSignal ikut di request per-pesan ───────────────────────────
for (const [label, fn] of [
  ['fetchMessage', () => fetchMessage('u@x.id', 'folderINBOX', 1)],
  ['markRead', () => markRead('u@x.id', 'folderINBOX', 1, true)],
  ['markFlagged', () => markFlagged('u@x.id', 'folderINBOX', 1, true)],
  ['searchMessages', () => searchMessages('u@x.id', 'folderINBOX', 'q')],
  ['fetchMessageHeaders', () => fetchMessageHeaders('u@x.id', 'folderINBOX', [1])],
]) {
  calls.length = 0;
  await fn();
  ok(calls.at(-1).options.signal instanceof AbortSignal, `${label}: request membawa AbortSignal (timeout)`);
}

// ── markReadBulk / markFlaggedBulk: paralelisme terbatas + bump sekali ───────
{
  bumpCount = 0; maxInFlight = 0; calls.length = 0; failUids = new Set([3]);
  const r = await markReadBulk('u@x.id', 'folderINBOX', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], true, { concurrency: 4 });
  eq(calls.length, 12, 'satu request per uid');
  ok(calls.every((c) => c.url.endsWith('/markMessageRead')), 'endpoint markMessageRead');
  ok(maxInFlight <= 4 && maxInFlight >= 2, `paralelisme dibatasi (${maxInFlight} ≤ 4)`);
  eq(r.ok.length, 11); eq(r.failed.length, 1); eq(r.failed[0].uid, 3, 'uid gagal dilaporkan, bukan throw');
  eq(bumpCount, 1, 'versi crossTab di-bump SEKALI untuk seluruh batch');

  bumpCount = 0; calls.length = 0; failUids = new Set();
  const r2 = await markReadBulk('u@x.id', 'folderINBOX', ['7', 'abc', 0], false);
  eq(calls.length, 1, 'uid tidak valid dibuang (normalizeUids)');
  ok(calls[0].url.endsWith('/7/markMessageUnread'));
  eq(r2.ok.length, 1); eq(bumpCount, 1);

  bumpCount = 0; calls.length = 0;
  const r3 = await markReadBulk('u@x.id', 'folderINBOX', [], true);
  eq(calls.length, 0); eq(bumpCount, 0, 'batch kosong tidak bump'); eq(r3.ok.length, 0);

  bumpCount = 0; calls.length = 0; maxInFlight = 0;
  const r4 = await markFlaggedBulk('u@x.id', 'folderINBOX', [1, 2, 3], false);
  ok(calls.every((c) => c.url.endsWith('/markUnflagged')), 'markFlaggedBulk → markUnflagged');
  eq(r4.ok.length, 3); eq(bumpCount, 1);

  // semua gagal → tidak bump (tidak ada mutasi sukses)
  bumpCount = 0; calls.length = 0; failUids = new Set([1, 2]);
  const r5 = await markFlaggedBulk('u@x.id', 'folderINBOX', [1, 2], true);
  eq(r5.failed.length, 2); eq(bumpCount, 0, 'tanpa sukses → tanpa bump');
  failUids = new Set();

  // per-uid markRead tetap bump (kontrak lama)
  bumpCount = 0;
  await markRead('u@x.id', 'folderINBOX', 1, true);
  eq(bumpCount, 1, 'markRead tunggal tetap bump versi');
}

// ── fetchMessageHeadersRaw: viewsource streaming berhenti di baris kosong ─────
{
  const enc = new TextEncoder();
  const chunks = [
    'Return-Path: <a@x.id>\r\nMessage-ID: <abc@x.id>\r\nReferences: <r1@x.id>\r\n <r2@x.id>\r\n',
    'In-Reply-To: <p@x.id>\r\n\r\nBody mulai di sini\r\n',
    'X'.repeat(10000),
  ];
  let reads = 0; let cancelled = false;
  viewsourceBody = {
    status: 200, ok: true,
    headers: { get: () => 'text/plain' },
    body: { getReader: () => ({
      read: async () => { if (reads >= chunks.length) return { done: true }; return { value: enc.encode(chunks[reads++]), done: false }; },
      cancel: async () => { cancelled = true; },
    }) },
    text: async () => { throw new Error('text() tidak boleh dipakai saat body stream tersedia'); },
  };
  calls.length = 0;
  const h = await fetchMessageHeadersRaw('u@x.id', 'folderINBOX', 42);
  ok(calls[0].url.endsWith('/Mail/0/folderINBOX/42/viewsource'), 'GET …/{uid}/viewsource');
  ok(calls[0].options.signal instanceof AbortSignal, 'viewsource membawa timeout');
  eq(h.messageId, '<abc@x.id>');
  eq(h.references, '<r1@x.id> <r2@x.id>', 'folded References digabung');
  eq(h.inReplyTo, '<p@x.id>');
  eq(reads, 2, 'berhenti membaca setelah baris kosong (chunk body besar tidak diunduh)');
  ok(cancelled, 'stream dibatalkan');
  ok(!h.raw.includes('Body mulai'), 'raw hanya blok header');

  // fallback tanpa stream → res.text()
  viewsourceBody = { status: 200, ok: true, headers: { get: () => 'text/plain' }, text: async () => 'Message-ID: <t@x.id>\n\nbody' };
  eq((await fetchMessageHeadersRaw('u@x.id', 'folderINBOX', 1)).messageId, '<t@x.id>', 'fallback text()');

  // 404 → throw
  viewsourceBody = { status: 404, ok: false, headers: { get: () => 'text/html' }, text: async () => '' };
  await assert.rejects(() => fetchMessageHeadersRaw('u@x.id', 'folderINBOX', 1), /404/); pass++;
}

console.log(`test-reader-api: ${pass} assertion OK`);
