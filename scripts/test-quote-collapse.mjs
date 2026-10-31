// ── Unit test: src/lib/quoteCollapse.js (lipat kutipan balasan) ──────────────
// Jalankan: node scripts/test-quote-collapse.mjs
import assert from 'node:assert/strict';
import { splitQuotedHtml, findQuoteStart, stripTags, findOutlookHeaderBlock } from '../src/lib/quoteCollapse.js';

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
  ok(['outlook-header', 'outlook-header-block', 'blockquote'].includes(r.kind), `header Outlook/blockquote dikenali (${r.kind})`);
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

// ── Outlook desktop (QA 2026-10-11): TANPA blockquote/gmail_quote/divRplyFwdMsg ──
// Pasca-DOMPurify: div border-top berisi p.MsoNormal dengan <b><span>From:</span></b>.
{
  const main = '<div class="WordSection1"><p class="MsoNormal"><span lang="IN">Baik Pak, sudah saya terima. Terima kasih.</span></p>'
    + '<p class="MsoNormal"><span lang="IN">&nbsp;</span></p>';
  const quote = '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">'
    + '<p class="MsoNormal"><b><span lang="EN-US">From:</span></b><span lang="EN-US"> Budi Santoso &lt;budi@example.net&gt; <br>'
    + '<b>Sent:</b> Friday, October 9, 2026 2:24 PM<br><b>To:</b> Andi Pratama &lt;andi.pratama@example.net&gt;<br>'
    + '<b>Cc:</b> Tim Ops &lt;ops@example.net&gt;<br><b>Subject:</b> RE: Laporan pengiriman minggu ini</span></p></div>'
    + '<p class="MsoNormal">&nbsp;</p><p class="MsoNormal">Mohon dicek laporan terlampir sebelum rapat hari Senin.</p></div>';
  const html = main + quote;
  const r = splitQuotedHtml(html);
  eq(r.kind, 'outlook-header-block', 'header Outlook EN di div border-top dikenali');
  eq(r.main, main, 'cut tepat SEBELUM div border-top (bukan di tengah <p>)');
  ok(r.quote.startsWith('<div style="border:none;border-top:solid #E1E1E1'), 'kutipan mulai di div border-top');
  eq(r.main + r.quote, html, 'pemisahan tidak mengubah konten');
}
// Label Indonesia (Outlook ID: Dari/Dikirim/Kepada/Perihal) + varian border-top tanpa border:none
{
  const html = '<div><p class="MsoNormal">Siap, akan diproses hari ini.</p>'
    + '<div style="border-top:solid #E1E1E1 1.0pt;padding:3pt 0 0 0"><p class="MsoNormal"><b>Dari:</b> Rina &lt;rina@x.id&gt;<br>'
    + '<b>Dikirim:</b> Kamis, 08 Oktober 2026 09.12<br><b>Kepada:</b> Andi &lt;andi@x.id&gt;<br>'
    + '<b>Perihal:</b> Permintaan pickup</p></div><p class="MsoNormal">Mohon jadwalkan pickup untuk 12 koli besok pagi.</p></div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'outlook-header-block', 'label Indonesia dikenali');
  eq(r.main, '<div><p class="MsoNormal">Siap, akan diproses hari ini.</p>');
  // "Subjek:" + "Tanggal:" juga diterima
  ok(findOutlookHeaderBlock('<p>Ok.</p><p><b>Dari:</b> A<br><b>Tanggal:</b> 1 Okt<br><b>Kepada:</b> B<br><b>Subjek:</b> C</p><p>isi lama yang panjang</p>') > 0, 'Subjek/Tanggal dikenali');
}
// Outlook web: <hr> + header → hr ikut dilipat
{
  const html = '<div>Noted, terima kasih.</div><hr style="display:inline-block;width:98%">'
    + '<div dir="ltr"><font face="Calibri"><b>From:</b> Budi<br><b>Sent:</b> Friday<br><b>To:</b> Andi<br><b>Subject:</b> X</font></div>'
    + '<div>Isi lama yang panjang sekali untuk dilipat.</div>';
  const r = splitQuotedHtml(html);
  eq(r.main, '<div>Noted, terima kasih.</div>', '<hr> pemisah masuk ke kutipan');
  ok(r.quote.startsWith('<hr'), 'kutipan mulai di <hr>');
}
// divRplyFwdMsg didahului <hr> → hr ikut dilipat (tidak tertinggal di main)
{
  const html = '<p>Baik.</p><hr tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> A<br><b>Sent:</b> B</div><div>Isi lama yang panjang sekali untuk dilipat.</div>';
  const r = splitQuotedHtml(html);
  eq(r.kind, 'outlook');
  eq(r.main, '<p>Baik.</p>');
}
// Label tidak lengkap (tanpa Subject) → bukan header Outlook
eq(findOutlookHeaderBlock('<p>Hai.</p><p><b>From:</b> A<br><b>Sent:</b> B<br><b>To:</b> C</p><p>' + 'lanjutan '.repeat(10) + '</p>'), -1, 'tanpa Subject: tidak dikenali');
// Label di tengah kalimat (bukan awal baris) → abaikan
eq(findOutlookHeaderBlock('<p>Paket dikirim from: gudang, sent: kemarin, to: kantor, subject: stok.</p>'), -1, 'label di tengah kalimat bukan header');
// Label di dalam atribut → abaikan (insideTag)
eq(findOutlookHeaderBlock('<p>Lihat <a title="From: A Sent: B To: C Subject: D" href="#">tautan</a> ini.</p>'), -1, 'label di atribut tag diabaikan');
// Header terlalu jauh (>400 karakter teks antara From: dan label lain) → abaikan
eq(findOutlookHeaderBlock('<p><b>From:</b> A ' + 'x'.repeat(450) + '<br><b>Sent:</b> B<br><b>To:</b> C<br><b>Subject:</b> D</p>'), -1, 'label di luar jendela 400 karakter');
// Newsletter: "From:/To:/Subject:" muncul di tengah artikel panjang → tetap
// boleh dideteksi hanya bila main tidak kosong; forward tanpa komentar (main
// kosong) TIDAK dilipat.
{
  const html = '<div style="border-top:solid #E1E1E1 1.0pt"><p><b>From:</b> A<br><b>Sent:</b> B<br><b>To:</b> C<br><b>Subject:</b> D</p></div><p>Isi diteruskan yang cukup panjang untuk dilipat.</p>';
  const r = splitQuotedHtml(html);
  eq(r.quote, '', 'main kosong (forward tanpa komentar) → tidak dilipat');
  eq(r.main, html);
}

// stripTags
eq(stripTags('<p>a&nbsp;b</p><style>x{}</style>'), 'a b');
eq(stripTags(null), '');

console.log(`test-quote-collapse: ${pass} assertion OK`);
