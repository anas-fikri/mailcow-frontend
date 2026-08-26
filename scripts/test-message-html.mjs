import assert from 'node:assert/strict';
import { looksLikeHtmlInPlainText, HTML_IN_PLAIN_RE, extractHtml } from '../src/lib/messageHtml.js';

// ── Bounce SOGo "Mail delivery failed" (text/plain berisi markup HTML) ───────
const bounce = `<div class="mailer_plaincontent">This message was created automatically by mail delivery software.<br /><br />A message that you sent could not be delivered to one or more of its<br />recipients. This is a permanent error. The following address(es) failed:<br /><br />  fabii_<a rel="noopener" href="mailto:cristina@hotmail.com">cristina@hotmail.com</a><br />    Domain pcpexpress.com has exceeded the max defers and failures per hour (30/30 (42%)) allowed. Message discarded.<br /></div>`;
assert.equal(looksLikeHtmlInPlainText(bounce), true);

// Varian kecil: div di tengah baris, tag uppercase, <br> tunggal.
assert.equal(looksLikeHtmlInPlainText('foo\n<div class="x">bar</div>'), true);
assert.equal(looksLikeHtmlInPlainText('<P>Halo</P>'), true);
assert.equal(looksLikeHtmlInPlainText('line one<br>line two'), true);
assert.equal(looksLikeHtmlInPlainText('<a href="mailto:x@y.test">x@y.test</a>'), true);
assert.equal(looksLikeHtmlInPlainText('<table><tr><td>sel</td></tr></table>'), true);
assert.equal(looksLikeHtmlInPlainText('<h2>Judul</h2>'), true);

// ── Teks biasa TIDAK boleh salah-render sebagai HTML ─────────────────────────
assert.equal(looksLikeHtmlInPlainText('Halo, ini teks biasa. a < b dan c > d. Terima kasih.'), false);
assert.equal(looksLikeHtmlInPlainText('Meeting jam 3 sore. Baca ini: if (x < 5) { y++; }'), false);
assert.equal(looksLikeHtmlInPlainText('Pertumbuhan 5 > 3 persen per tahun.'), false);
assert.equal(looksLikeHtmlInPlainText('Cek dokumen di https://example.com/docs/page'), false);

// ── Tag di luar daftar dikenal TIDAK memicu render-HTML (konservatif) ────────
assert.equal(looksLikeHtmlInPlainText('custom <widget id="1"> tetap teks'), false);
assert.equal(looksLikeHtmlInPlainText('a <script> alert(1) </script> tetap teks'), false);

// ── Input kosong / non-string ────────────────────────────────────────────────
assert.equal(looksLikeHtmlInPlainText(''), false);
assert.equal(looksLikeHtmlInPlainText(null), false);
assert.equal(looksLikeHtmlInPlainText(undefined), false);

// Regex diekspor dan tetap kompatibel (dipakai langsung di tempat lain).
assert.ok(HTML_IN_PLAIN_RE instanceof RegExp);
assert.equal(HTML_IN_PLAIN_RE.test(bounce), true);

// ── extractHtml (struktur MIME parts SOGo /view) ─────────────────────────────
// html langsung
assert.equal(extractHtml({ contentType: 'text/html', content: '<p>Halo</p>' }), '<p>Halo</p>');
// plain dibungkus div white-space:pre-wrap (tanpa escape — DOMPurify yang handle)
assert.equal(
  extractHtml({ contentType: 'text/plain', content: 'baris1\nbaris2' }),
  '<div style="white-space:pre-wrap">baris1\nbaris2</div>'
);
// array parts → cari text/html dulu
const mixed = {
  contentType: 'multipart/alternative',
  content: [
    { contentType: 'text/plain', content: 'versi plain' },
    { contentType: 'text/html', content: '<p>versi html</p>' },
  ],
};
assert.equal(extractHtml(mixed), '<p>versi html</p>');
// nested array parts (multipart/mixed → multipart/alternative)
const nested = {
  contentType: 'multipart/mixed',
  content: [
    { contentType: 'text/plain', content: 'plain' },
    { contentType: 'multipart/alternative', content: [{ contentType: 'text/html', content: '<b>nested html</b>' }] },
  ],
};
assert.equal(extractHtml(nested), '<b>nested html</b>');
// tanpa html sama sekali → plain terakhir yang ditemukan
assert.equal(extractHtml({ contentType: 'multipart/mixed', content: [{ contentType: 'text/plain', content: 'hanya plain' }] }), '<div style="white-space:pre-wrap">hanya plain</div>');
// kosong / null / tanpa konten
assert.equal(extractHtml(null), '');
assert.equal(extractHtml({}), '');
assert.equal(extractHtml({ contentType: 'application/pdf', content: 'x' }), '');
assert.equal(extractHtml({ contentType: 'text/html' }), '');

console.log('messageHtml assertions passed');
