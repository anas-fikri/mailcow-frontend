import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// DOMPurify butuh window/document — pasang jsdom globals dulu.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://mail.example.net/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element',
  'DOMParser', 'getComputedStyle', 'MutationObserver', 'CustomEvent', 'Event']) {
  try { globalThis[k] = window[k]; }
  catch {
    Object.defineProperty(globalThis, k, { value: window[k], writable: true, configurable: true });
  }
}

const { sendMessage, _waitForContactCaptures } = await import('../src/lib/api.js');

// Tangkap semua request fetch; kembalikan 200 agar jalur lanjut.
const sent = [];
globalThis.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  return {
    status: 200, ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ ok: true, messageId: 'm1' }),
    text: async () => '',
  };
};

// ── Jalur 1: ada lampiran → langsung /api/send (SMTP proxy) ──────────────────
sent.length = 0;
await sendMessage('token@x.test', {
  to: 'a@x.test', subject: 'XSS',
  // Payload XSS: script tag, onerror handler, javascript: href, data: href
  body: '<p>halo <script>alert(1)</script><img src=x onerror="alert(2)">'
      + '<a href="javascript:alert(3)">j</a><a href="data:text/html,<script>alert(4)</script>">d</a>'
      + '<a href="https://example.com" target="_blank">ok</a></p>',
  isHTML: true,
  attachments: [{ filename: 'a.txt', contentType: 'text/plain', data: 'YQ==' }],
});
await _waitForContactCaptures(); // capture fire-and-forget settle sebelum fase berikutnya
assert.ok(sent.length >= 1, 'minimal 1 request (SMTP path)');
assert.ok(String(sent[0].url).includes('/api/send'), 'kirim via /api/send (request pertama)');
const smtpBody = sent[0].body.body;
assert.ok(!smtpBody.includes('<script>'), 'script tag dihapus');
assert.ok(!smtpBody.includes('onerror'), 'event handler dihapus');
assert.ok(!smtpBody.includes('javascript:'), 'javascript: href dihapus');
assert.ok(!smtpBody.includes('data:text/html'), 'data: href pada <a> dihapus (hardening hook)');
assert.ok(smtpBody.includes('https://example.com'), 'link http aman dipertahankan');
assert.ok(smtpBody.includes('rel="noopener noreferrer"'), 'tabnabbing rel dipaksa');
assert.ok(smtpBody.includes('<p>halo'), 'konten sah dipertahankan');

// ── Jalur 2: tanpa lampiran → SOGo compose/send, fallback SMTP bila 501 ─────
// SOGo send 501 → fallback ke /api/send — body tetap yang sudah di-sanitize.
sent.length = 0;
let sogoCalled = 0;
globalThis.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('/compose')) {
    return { status: 200, ok: true, headers: { get: () => 'application/json' },
      json: async () => ({ draftId: 'd1' }), text: async () => '' };
  }
  if (String(url).includes('/folderDrafts/')) {
    return { status: 501, ok: false, headers: { get: () => 'text/plain' },
      json: async () => ({}), text: async () => 'Not implemented' };
  }
  if (String(url).includes('/api/send')) sogoCalled++; // hitung HANYA fallback SMTP (capture kontak jangan ikut terhitung)
  return { status: 200, ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ ok: true, messageId: 'm2' }), text: async () => '' };
};
await sendMessage('token@x.test', {
  to: 'a@x.test', subject: 'XSS2',
  body: '<b>tebal</b><script>alert(1)</script><img src=x onerror="alert(2)">',
  isHTML: true,
  attachments: [],
});
await _waitForContactCaptures();
assert.equal(sogoCalled, 1, 'fallback SMTP dipanggil setelah 501');
const fallback = sent.find((s) => String(s.url).includes('/api/send'));
assert.ok(fallback, 'ada request /api/send fallback');
assert.ok(!fallback.body.body.includes('<script>'), 'body fallback sudah di-sanitize');
assert.ok(!fallback.body.body.includes('onerror'), 'event handler dihapus di fallback');
assert.ok(fallback.body.body.includes('<b>tebal</b>'), 'konten sah dipertahankan');

// ── Jalur 3: mode plain (isHTML=false) → body TIDAK diubah ───────────────────
sent.length = 0;
globalThis.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
  return { status: 200, ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ ok: true }), text: async () => '' };
};
await sendMessage('token@x.test', {
  to: 'a@x.test', subject: 'Plain', body: '<script>alert(1)</script> teks', isHTML: false,
  attachments: [{ filename: 'a.txt', contentType: 'text/plain', data: 'YQ==' }],
});
await _waitForContactCaptures();
assert.equal(sent[0].body.body, '<script>alert(1)</script> teks', 'plain text dikirim apa adanya (dikirim sebagai text/plain, bukan HTML)');

// ── Jalur 4: isHTML=true dengan body kosong / non-string → tidak crash ──────
sent.length = 0;
await sendMessage('token@x.test', {
  to: 'a@x.test', subject: 'Kosong', body: undefined, isHTML: true,
  attachments: [{ filename: 'a.txt', contentType: 'text/plain', data: 'YQ==' }],
});
await _waitForContactCaptures();
assert.equal(typeof sent[0].body.body, 'string', 'body kosong → string (sanitize non-string tidak crash)');

console.log('send-sanitize assertions passed');
