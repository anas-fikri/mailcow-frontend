import assert from 'node:assert/strict';
import { looksLikeHtmlInPlainText, HTML_IN_PLAIN_RE } from '../src/lib/messageHtml.js';

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

console.log('messageHtml assertions passed');
