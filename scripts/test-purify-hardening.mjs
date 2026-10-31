import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { hardenAnchorNode, registerPurifyHardening } from '../src/lib/pasteUtils.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');

function anchor(attrs = {}) {
  const a = document.createElement('a');
  a.textContent = 'link';
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  return a;
}

// ── Paste-XSS: data: URI pada href harus dihapus ────────────────────────────
const dataLink = anchor({ href: 'data:text/html,<script>alert(1)</script>', target: '_blank' });
hardenAnchorNode(dataLink);
assert.equal(dataLink.hasAttribute('href'), false, 'data: href harus dihapus (anti paste-XSS)');
assert.equal(dataLink.getAttribute('rel'), 'noopener noreferrer', 'target=_blank wajib rel noopener');

// Variasi casing/whitespace pada data:
const dataLink2 = anchor({ href: '  DATA:text/html,hi' });
hardenAnchorNode(dataLink2);
assert.equal(dataLink2.hasAttribute('href'), false, 'data: href (casing/space) harus dihapus');

// ── Tabnabbing: <a target="_blank"> tanpa rel → rel dipaksa ─────────────────
const blankLink = anchor({ href: 'https://example.com/x', target: '_blank' });
hardenAnchorNode(blankLink);
assert.equal(blankLink.getAttribute('href'), 'https://example.com/x', 'href aman tetap dipertahankan');
assert.equal(blankLink.getAttribute('rel'), 'noopener noreferrer', 'target=_blank wajib rel noopener');

// ── Link aman tanpa target=_blank tidak diubah ──────────────────────────────
const safeLink = anchor({ href: 'https://example.com/x' });
hardenAnchorNode(safeLink);
assert.equal(safeLink.getAttribute('href'), 'https://example.com/x');
assert.equal(safeLink.hasAttribute('rel'), false, 'link tanpa target=_blank tidak boleh diberi rel');

// ── mailto/tel tetap lolos (bukan data:) ────────────────────────────────────
const mailLink = anchor({ href: 'mailto:a@b.test' });
hardenAnchorNode(mailLink);
assert.equal(mailLink.getAttribute('href'), 'mailto:a@b.test');

const telLink = anchor({ href: 'tel:+6212345' });
hardenAnchorNode(telLink);
assert.equal(telLink.getAttribute('href'), 'tel:+6212345');

// ── Non-anchor node: no-op (img data: utk inline image composer tetap aman) ──
const img = document.createElement('img');
img.setAttribute('src', 'data:image/png;base64,AAAA');
hardenAnchorNode(img);
assert.equal(img.getAttribute('src'), 'data:image/png;base64,AAAA', 'img data: src harus tetap (inline image)');

// ── registerPurifyHardening: pasang hook ke instance DOMPurify ──────────────
let registered = null;
const mock = { addHook: (type, fn) => { registered = { type, fn }; } };
registerPurifyHardening(mock);
assert.equal(registered.type, 'afterSanitizeAttributes', 'hook harus tipe afterSanitizeAttributes');
assert.equal(registered.fn, hardenAnchorNode, 'hook harus fungsi hardenAnchorNode');

console.log('purify hardening assertions passed');
