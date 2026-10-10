// ── Unit test: src/lib/quoteCollapse.js (lipat kutipan balasan) ──────────────
// Jalankan: node scripts/test-quote-collapse.mjs
import assert from 'node:assert/strict';
import { splitQuotedHtml, findQuoteStart, stripTags } from '../src/lib/quoteCollapse.js';

let pass = 0;
const ok = (cond, msg = 'assertion') => { assert.ok(cond, msg); pass++; };
const eq = (a, b, msg = '') => { assert.equal(a, b, msg || `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); pass++; };

// Tanpa kutipan → utuh
{
  const html = '<p>Halo, ini pesan biasa tanpa kutipan apa pun.</p>';
  const r = splitQuotedHtml(html);
  eq(r.main, html); eq(r.quote, ''); eq(r.kind, null);
  eq(findQuoteStart(''), null); eq(findQuoteStart(null), null);
}

// <blockquote type="cite"> (Apple Mail/Thunderbird)
{
  const html = '<div>Terima kasih, akan saya cek.</div><br><blockquote type="cite"><div>Pesan asli yang cukup panjang untuk dilipat di sini.</div></blockquote>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'blockquote-cite');
  eq(r.main, '<div>Terima kasih, akan saya cek.</div><br>');
  ok(r.quote.startsWith('<blockquote type="cite">'));
}

// Gmail: div.gmail_quote dengan "On … wrote:" di dalamnya → cut di div
{
  const html = '<div dir="ltr">Siap, terima kasih.</div><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Fri, Sep 4, 2026 at 2:24 PM Budi &lt;budi@x.id&gt; wrote:<br></div><blockquote class="gmail_quote">Isi lama yang panjang sekali untuk dilipat.</blockquote></div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'gmail_quote');
  eq(r.main, '<div dir="ltr">Siap, terima kasih.</div>');
}

// Outlook: divRplyFwdMsg
{
  const html = '<div class="WordSection1"><p>Baik, noted.</p></div><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri"><b>From:</b> Budi<br><b>Sent:</b> Friday<br><b>Subject:</b> X</font></div><div>Isi lama yang panjang sekali untuk dilipat.</div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'outlook');
  eq(r.main, '<div class="WordSection1"><p>Baik, noted.</p></div>');
}

// Marker teks "On … wrote:" tanpa container → mundur ke awal blok pembungkus
{
  const html = '<p>Oke.</p><p>On Fri, Sep 4, 2026, Budi &lt;b@x.id&gt; wrote:</p><p>&gt; teks lama yang panjang sekali untuk dilipat</p>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'on-wrote');
  eq(r.main, '<p>Oke.</p>', 'cut mundur ke <p> pembungkus marker');
}

// Marker Indonesia "Pada … menulis:"
{
  const html = '<div>Siap.</div><div>Pada Jum, 4 Sep 2026 14.24, Budi &lt;b@x.id&gt; menulis:</div><blockquote>teks lama yang panjang sekali untuk dilipat</blockquote>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'pada-menulis');
  eq(r.main, '<div>Siap.</div>');
}

// -----Original Message----- (Outlook plain) di dalam pre-wrap
{
  const html = '<div style="white-space:pre-wrap">Terima kasih.\n\n-----Original Message-----\nFrom: Budi\nSent: Friday\nSubject: X\n\nIsi lama yang panjang sekali untuk dilipat</div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'original-message');
  ok(r.main.startsWith('<div style="white-space:pre-wrap">Terima kasih.'), 'main = teks sebelum marker (di dalam blok yang sama)');
  ok(r.quote.startsWith('-----Original Message-----'), 'quote mulai tepat di marker');
}
// Varian Indonesia "-----Pesan Asli-----" & "---------- Pesan Diteruskan ----------"
eq(splitQuotedHtml('<p>Ok.</p><p>-----Pesan Asli-----<br>Dari: A<br>isi lama panjang sekali untuk dilipat</p>').kind, 'original-message');
eq(splitQuotedHtml('<p>FYI.</p><p>---------- Forwarded message ---------<br>From: A<br>isi lama panjang sekali untuk dilipat</p>').kind, 'forwarded');

// Header kutipan bikinan replyBuilder ("Dari: … <br> Dikirim:")
{
  const html = '<p>Balasan saya.</p><div style="border-top:1px solid #e1e1e1"><b>Dari:</b> Budi &lt;b@x.id&gt;<br><b>Dikirim:</b> Jumat<br><b>Kepada:</b> Saya<br><b>Subjek:</b> X</div><blockquote>isi lama panjang sekali untuk dilipat</blockquote>';
  const r = splitQuotedHtml(html);
  ok(r.kind === 'outlook-header' || r.kind === 'blockquote', `header Outlook/blockquote dikenali (${r.kind})`);
  eq(r.main, '<p>Balasan saya.</p>');
}

// Kutipan teks polos "&gt; " (text/plain pre-wrap)
{
  const html = '<div style="white-space:pre-wrap">Setuju.\n\n&gt; baris lama satu yang panjang\n&gt; baris lama dua yang panjang</div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'plain-gt');
  ok(r.quote.startsWith('&gt; baris lama satu'));
}

// Seluruh pesan = kutipan (forward tanpa komentar) → JANGAN dilipat
{
  const html = '<blockquote type="cite"><p>Isi pesan diteruskan yang cukup panjang untuk dilipat.</p></blockquote>';
  const r = splitQuotedHtml(html);
  eq(r.quote, '', 'main kosong → tidak dilipat');
  eq(r.main, html);
}

// Kutipan terlalu pendek → tidak dilipat
{
  const html = '<p>Teks utama yang panjang.</p><blockquote type="cite">ok</blockquote>';
  eq(splitQuotedHtml(html).quote, '');
}

// <blockquote> dekoratif newsletter (banyak teks setelahnya) → tidak dilipat
{
  const html = '<p>Intro.</p><blockquote>Kutipan motivasi yang panjang sekali untuk dilipat.</blockquote>' + '<p>' + 'Artikel panjang. '.repeat(30) + '</p>';
  const r = splitQuotedHtml(html);
  eq(r.kind, null, 'blockquote polos diikuti banyak teks bukan kutipan balasan');
}
// <blockquote> polos di akhir pesan (reply plain umum) → dilipat
{
  const html = '<p>Oke, lanjut.</p><blockquote>Isi pesan lama yang panjang sekali untuk dilipat ya.</blockquote><p>-- <br>Sig</p>';
  eq(splitQuotedHtml(html).kind, 'blockquote');
}

// Marker di dalam atribut tag diabaikan
{
  const html = '<p>Lihat <a href="https://x.id/On-Monday-he-wrote:" title="On Monday he wrote:">tautan</a> ini, teks lanjutan yang panjang.</p>';
  const r = splitQuotedHtml(html);
  eq(r.kind, null, 'marker di dalam tag tidak dihitung');
}

// Marker paling AWAL yang menang
{
  const html = '<p>Hai.</p><div class="gmail_quote">On X wrote:<br>isi lama panjang sekali untuk dilipat</div><blockquote type="cite">lagi</blockquote>';
  eq(splitQuotedHtml(html).kind, 'gmail_quote');
}

// main + quote = html asli (tidak ada karakter hilang)
{
  const html = '<p>Hai.</p><blockquote type="cite"><p>isi lama panjang sekali untuk dilipat</p></blockquote>';
  const r = splitQuotedHtml(html);
  eq(r.main + r.quote, html, 'pemisahan tidak mengubah konten');
}

// stripTags
eq(stripTags('<p>a&nbsp;b</p><style>x{}</style>'), 'a b');
eq(stripTags(null), '');

console.log(`test-quote-collapse: ${pass} assertion OK`);
