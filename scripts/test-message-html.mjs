import assert from 'node:assert/strict';
import { looksLikeHtmlInPlainText, HTML_IN_PLAIN_RE, extractHtml, extractAttachments } from '../src/lib/messageHtml.js';

// ── Bounce SOGo "Mail delivery failed" (text/plain berisi markup HTML) ───────
const bounce = `<div class="mailer_plaincontent">This message was created automatically by mail delivery software.<br /><br />A message that you sent could not be delivered to one or more of its<br />recipients. This is a permanent error. The following address(es) failed:<br /><br />  fabii_<a rel="noopener" href="mailto:cristina@hotmail.com">cristina@hotmail.com</a><br />    Domain example.net has exceeded the max defers and failures per hour (30/30 (42%)) allowed. Message discarded.<br /></div>`;
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

// ── extractAttachments (part non-inline dengan downloadURL) ──────────────────
const partsWithAtt = {
  contentType: 'multipart/mixed',
  content: [
    { contentType: 'text/html', content: '<p>isi</p>' }, // inline → bukan lampiran
    {
      contentType: 'application/pdf',
      filename: 'laporan.pdf',
      size: '1.2 MB',
      downloadURL: '/SOGo/so/x/Mail/0/folderDrafts/9/viewPart?part=2',
    },
    {
      contentType: 'multipart/mixed',
      content: [{
        contentType: 'image/png',
        filename: 'foto.png',
        size: 2048,
        downloadURL: '/SOGo/so/x/Mail/0/folderDrafts/9/viewPart?part=3',
      }],
    },
  ],
};
const atts = extractAttachments(partsWithAtt);
assert.equal(atts.length, 2, 'html inline tidak dihitung, nested ikut');
assert.equal(atts[0].name, 'laporan.pdf');
assert.equal(atts[0].contentType, 'application/pdf');
assert.equal(atts[0].downloadURL.includes('viewPart?part=2'), true);
assert.equal(atts[1].name, 'foto.png');
assert.equal(atts[1].size, 2048);
// viewURL tersimpan utk preview lightbox (fallback ke downloadURL).
assert.equal(atts[0].viewURL.includes('viewPart?part=2'), true, 'viewURL dari part');
assert.equal(atts[1].viewURL, atts[1].downloadURL, 'viewURL fallback ke downloadURL');
// part dengan viewURL saja (tanpa downloadURL) tetap lampiran + downloadURL fallback.
const viewOnly = extractAttachments({ contentType: 'application/pdf', filename: 'v.pdf', viewURL: '/SOGo/so/x/viewPart?part=9' });
assert.equal(viewOnly.length, 1, 'viewURL saja tetap dihitung lampiran');
assert.equal(viewOnly[0].downloadURL.includes('part=9'), true, 'downloadURL fallback ke viewURL');
// part tanpa downloadURL (mis. text/plain) → bukan lampiran
assert.equal(extractAttachments({ contentType: 'text/plain', content: 'x' }).length, 0);
assert.equal(extractAttachments(null).length, 0);

// ── REGRESI 2026-09-22: parts sebagai ARRAY langsung (regresi restore 08bef9c) ─
// Bug produksi: lampiran tidak muncul + gambar CID footer masuk daftar Lampiran.
// Ground truth flag: SOGo native Message.service.js:464 — shouldDisplayAttachment
// 0 = konten sudah tampil di body (inline CID) → BUKAN lampiran.
const arrayParts = [
  {
    contentType: 'multipart/alternative',
    content: [
      { contentType: 'text/plain', content: 'versi plain' },
      { contentType: 'text/html', content: '<p>Body <img src="cid:footer.png"></p>' },
    ],
  },
  {
    contentType: 'image/png',
    filename: 'footer.png',
    contentId: '<footer.png>',
    size: '1.2 KB',
    downloadURL: '/SOGo/so/x/Mail/0/folderINBOX/9/1/footer.png',
    shouldDisplayAttachment: 0, // inline CID → sudah dirender di body
  },
  {
    contentType: 'application/pdf',
    filename: 'laporan.pdf',
    size: '144 B',
    downloadURL: '/SOGo/so/x/Mail/0/folderINBOX/9/2/asAttachment/laporan.pdf',
    viewURL: '/SOGo/so/x/Mail/0/folderINBOX/9/2/laporan.pdf',
    shouldDisplayAttachment: 1,
  },
];
// body html tetap ketemu meski top-level parts = array
assert.equal(extractHtml(arrayParts), '<p>Body <img src="cid:footer.png"></p>');
// lampiran: HANYA pdf — footer.png (flag 0) tidak dobel di daftar Lampiran
const attsArray = extractAttachments(arrayParts);
assert.equal(attsArray.length, 1, 'CID inline (flag 0) di-skip, hanya lampiran asli');
assert.equal(attsArray[0].name, 'laporan.pdf');
assert.equal(attsArray[0].downloadURL.includes('asAttachment'), true);

// Varian: flag 0 pada SEMUA tipe (kontrak SOGo), flag 1/undefined tetap lampiran
assert.equal(extractAttachments({ contentType: 'application/zip', filename: 'a.zip', downloadURL: 'u', shouldDisplayAttachment: 0 }).length, 0, 'flag 0 non-gambar pun di-skip');
assert.equal(extractAttachments({ contentType: 'application/zip', filename: 'a.zip', downloadURL: 'u', shouldDisplayAttachment: 1 }).length, 1);
assert.equal(extractAttachments({ contentType: 'application/zip', filename: 'a.zip', downloadURL: 'u' }).length, 1, 'tanpa flag = lampiran (perilaku lama)');
assert.equal(extractAttachments({ contentType: 'text/html', content: 'x', downloadURL: 'u', shouldDisplayAttachment: 0 }).length, 0);

// Array BERSARANG di dalam content (guard harus rekursif, bukan cuma top-level)
const nestedArrayInContent = {
  contentType: 'multipart/mixed',
  content: [
    [{ contentType: 'text/html', content: '<b>deep html</b>' }],
    [{ contentType: 'application/pdf', filename: 'deep.pdf', downloadURL: 'u-deep' }],
  ],
};
assert.equal(extractHtml(nestedArrayInContent), '<b>deep html</b>');
const deepAtts = extractAttachments(nestedArrayInContent);
assert.equal(deepAtts.length, 1);
assert.equal(deepAtts[0].name, 'deep.pdf');

// CID footer dengan flag undefined (SOGo varian lama) TETAP masuk lampiran —
// fallback aman, tidak pernah memakan lampiran asli.
assert.equal(extractAttachments({ contentType: 'image/png', filename: 'logo.png', downloadURL: 'u' }).length, 1);

console.log('messageHtml assertions passed');
