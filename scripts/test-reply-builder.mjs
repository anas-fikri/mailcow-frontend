// ── Unit test: src/lib/replyBuilder.js (Balas / Balas Semua / Teruskan) ──────
// Jalankan: node scripts/test-reply-builder.mjs
import assert from 'node:assert/strict';
import {
  buildReplyData, buildReplyDataAsync, buildSubject, normalizeAddressList,
  buildQuoteHeader, parseSogoDate, formatLongDateId, normalizeMessageIdList,
  pickThreadingHeaders, escapeHtml,
} from '../src/lib/replyBuilder.js';
import { parseRawHeaders } from '../src/lib/messageHtml.js';

let pass = 0;
const ok = (cond, msg = 'assertion') => { assert.ok(cond, msg); pass++; };
const eq = (a, b, msg = '') => { assert.equal(a, b, msg || `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); pass++; };

// ── buildSubject: prefix case-insensitive, tanpa duplikasi ───────────────────
eq(buildSubject('Halo', 'reply'), 'Re: Halo');
eq(buildSubject('Re: Halo', 'reply'), 'Re: Halo', 'Re: tidak digandakan');
eq(buildSubject('RE: Halo', 'reply'), 'Re: Halo', 'RE: (huruf besar) dikenali');
eq(buildSubject('AW: Halo', 'reply'), 'Re: Halo', 'AW: (Jerman) dikenali');
eq(buildSubject('re: RE: Re: Halo', 'reply'), 'Re: Halo', 'prefix berulang dibuang semua');
eq(buildSubject('Re[2]: Halo', 'reply'), 'Re: Halo', 'bentuk Re[n]: dibuang');
eq(buildSubject('Fwd: Halo', 'reply'), 'Re: Fwd: Halo', 'balas atas forward → Re: Fwd: (ala Outlook)');
eq(buildSubject('Halo', 'replyAll'), 'Re: Halo');
eq(buildSubject('Halo', 'forward'), 'Fwd: Halo');
eq(buildSubject('Fwd: Halo', 'forward'), 'Fwd: Halo', 'Fwd: tidak digandakan');
eq(buildSubject('FW: Halo', 'forward'), 'Fwd: Halo', 'FW: dikenali');
eq(buildSubject('TR: Halo', 'forward'), 'Fwd: Halo', 'TR: (Prancis) dikenali');
eq(buildSubject('Re: Halo', 'forward'), 'Fwd: Re: Halo', 'forward atas balasan → Fwd: Re:');
eq(buildSubject('', 'reply'), 'Re: (Tanpa Subjek)');
eq(buildSubject(undefined, 'forward'), 'Fwd: (Tanpa Subjek)');
eq(buildSubject('Rencana: rapat', 'reply'), 'Re: Rencana: rapat', 'kata biasa diikuti ":" bukan prefix');
eq(buildSubject('Reminder', 'reply'), 'Re: Reminder', '"Re" harus diikuti ":"');

// ── normalizeAddressList ─────────────────────────────────────────────────────
assert.deepEqual(normalizeAddressList(null), []); pass++;
assert.deepEqual(normalizeAddressList([{ name: 'A', email: 'a@x.id' }, null, 'b@x.id', 'C <c@x.id>', { name: '', email: '' }]),
  [{ name: 'A', email: 'a@x.id' }, { name: '', email: 'b@x.id' }, { name: 'C', email: 'c@x.id' }]); pass++;

// ── Tanggal ──────────────────────────────────────────────────────────────────
ok(parseSogoDate('Friday, September 04, 2026 14:24 WIB') instanceof Date, 'format SOGo + zona WIB diparse');
eq(parseSogoDate('Friday, September 04, 2026 14:24 WIB').getHours(), 14, 'jam lokal dipertahankan');
eq(parseSogoDate(''), null); eq(parseSogoDate(null), null); eq(parseSogoDate('bukan tanggal'), null);
ok(/2026/.test(formatLongDateId('Friday, September 04, 2026 14:24 WIB')), 'tanggal panjang memuat tahun');
ok(/September/.test(formatLongDateId('Friday, September 04, 2026 14:24 WIB')), 'nama bulan id-ID');
eq(formatLongDateId('xyz'), 'xyz', 'fallback ke string asli');

// ── Header kutipan ala Outlook ───────────────────────────────────────────────
{
  const h = buildQuoteHeader({ from: 'A <a@x.id>', date: 'Jumat', to: 'B <b@x.id>', cc: '', subject: 'S <x>' });
  ok(h.includes('<b>Dari:</b> A &lt;a@x.id&gt;'), 'Dari di-escape');
  ok(h.includes('<b>Dikirim:</b> Jumat'), 'Dikirim');
  ok(h.includes('<b>Kepada:</b> B &lt;b@x.id&gt;'), 'Kepada');
  ok(!h.includes('<b>Cc:</b>'), 'Cc kosong → tidak ditampilkan');
  ok(h.includes('<b>Subjek:</b> S &lt;x&gt;'), 'Subjek di-escape');
  const h2 = buildQuoteHeader({ from: 'A', date: 'D', to: 'B', cc: 'C <c@x.id>', subject: 'S', forward: true });
  ok(h2.includes('<b>Cc:</b> C &lt;c@x.id&gt;'), 'Cc ditampilkan bila ada');
  ok(h2.includes('Pesan Diteruskan'), 'judul forward');
}
eq(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');

// ── Message-ID helpers ───────────────────────────────────────────────────────
assert.deepEqual(normalizeMessageIdList('<a@x> <b@y> <a@x> junk <c>'), ['<a@x>', '<b@y>']); pass++;
assert.deepEqual(normalizeMessageIdList(['<a@x>', '<b@y>']), ['<a@x>', '<b@y>']); pass++;
assert.deepEqual(normalizeMessageIdList(''), []); pass++;
{
  const t = pickThreadingHeaders({ messageId: '<m@x>', references: '<r1@x> <r2@x>' });
  eq(t.messageId, '<m@x>'); assert.deepEqual(t.references, ['<r1@x>', '<r2@x>']); pass++;
  const t2 = pickThreadingHeaders({}, { messageId: '<h@x>', inReplyTo: '<p@x>' });
  eq(t2.messageId, '<h@x>'); eq(t2.inReplyTo, '<p@x>');
  const t3 = pickThreadingHeaders({ messageId: '<m@x>' }, { messageId: '<h@x>' });
  eq(t3.messageId, '<h@x>', 'header mentah menang atas field JSON');
}

// ── parseRawHeaders (viewsource) ─────────────────────────────────────────────
{
  const raw = 'Return-Path: <a@x.id>\r\nMessage-ID:\r\n <abc@x.id>\r\nReferences: <r1@x.id>\r\n\t<r2@x.id>\r\nIn-Reply-To: <p@x.id>\r\nSubject: Halo\r\n\r\nBody: bukan header\r\nMessage-ID: <palsu@x.id>\r\n';
  const h = parseRawHeaders(raw);
  eq(h.messageId, '<abc@x.id>', 'baris folded digabung');
  eq(h.references, '<r1@x.id> <r2@x.id>', 'References folded (tab) digabung');
  eq(h.inReplyTo, '<p@x.id>');
  eq(h.get('subject'), 'Halo'); eq(h.get('SUBJECT'), 'Halo', 'get case-insensitive');
  ok(!h.raw.includes('palsu'), 'parse berhenti di baris kosong pertama (body diabaikan)');
  eq(h.list.length, 5);
  eq(parseRawHeaders('').messageId, '');
  eq(parseRawHeaders(null).list.length, 0);
}

// ── buildReplyData ───────────────────────────────────────────────────────────
const message = {
  from: [{ name: 'Budi', email: 'budi@pcp.id' }],
  to: [{ name: 'Saya', email: 'Me@PCP.id' }, { name: 'Citra', email: 'citra@pcp.id' }],
  cc: [{ name: 'Dewi', email: 'dewi@pcp.id' }, { name: 'Saya alias', email: 'me@pcp.id' }, { name: 'Citra dup', email: 'CITRA@pcp.id' }],
  subject: 'RE: Laporan <Q3>',
  date: 'Friday, September 04, 2026 14:24 WIB',
  parts: { contentType: 'text/html', content: '<p>Isi <b>asli</b></p>' },
};
const base = { userEmail: 'me@pcp.id', folderId: 'folderINBOX', uid: 42 };

// reply
{
  const r = buildReplyData(message, { ...base, mode: 'reply' });
  eq(r.composeMode, 'reply');
  eq(r.to, 'Budi <budi@pcp.id>', 'reply → To = From');
  eq(r.cc, ''); eq(r.bcc, '');
  eq(r.subject, 'Re: Laporan <Q3>');
  ok(r.body.startsWith('<br><br>'), 'kursor di atas kutipan');
  ok(r.body.includes('<b>Dari:</b> Budi &lt;budi@pcp.id&gt;'), 'header kutipan Dari');
  ok(/<b>Dikirim:<\/b> .*2026/.test(r.body), 'header kutipan Dikirim (tanggal panjang)');
  ok(r.body.includes('<b>Kepada:</b> Saya &lt;Me@PCP.id&gt;, Citra &lt;citra@pcp.id&gt;'), 'Kepada lengkap');
  ok(r.body.includes('<b>Cc:</b> Dewi'), 'Cc tampil bila ada');
  ok(r.body.includes('<b>Subjek:</b> RE: Laporan &lt;Q3&gt;'), 'Subjek asli di-escape');
  ok(/<blockquote[^>]*>.*<p>Isi <b>asli<\/b><\/p><\/blockquote>$/s.test(r.body), 'body asli di dalam blockquote');
  assert.deepEqual(r.attachments, []); pass++;
  eq(r.inReplyTo, ''); eq(r.references, '', 'tanpa Message-ID → kosong (bukan undefined)');
  eq(r.sourceFolder, 'folderINBOX'); eq(r.sourceUid, 42);
}
// reply → Reply-To menang
{
  const r = buildReplyData({ ...message, 'reply-to': [{ name: 'Tiket', email: 'tiket@pcp.id' }] }, { ...base, mode: 'reply' });
  eq(r.to, 'Tiket <tiket@pcp.id>', 'Reply-To diutamakan');
}
// replyAll
{
  const r = buildReplyData(message, { ...base, mode: 'replyAll' });
  eq(r.composeMode, 'replyAll');
  eq(r.to, 'Budi <budi@pcp.id>, Citra <citra@pcp.id>', 'To = From + To asli minus diri sendiri (case-insensitive)');
  eq(r.cc, 'Dewi <dewi@pcp.id>', 'Cc minus diri sendiri & minus duplikat yang sudah di To');
  eq(r.subject, 'Re: Laporan <Q3>');
}
// replyAll — userEmail array (alias) & Reply-To
{
  const r = buildReplyData({ ...message, 'reply-to': [{ name: 'Tiket', email: 'tiket@pcp.id' }] },
    { ...base, mode: 'replyAll', userEmail: ['me@pcp.id', 'citra@pcp.id'] });
  eq(r.to, 'Tiket <tiket@pcp.id>', 'Reply-To + To asli minus semua alias user');
  eq(r.cc, 'Dewi <dewi@pcp.id>');
}
// replyAll — pesan dari diri sendiri (Terkirim): To tidak boleh kosong
{
  const r = buildReplyData({ from: [{ name: 'Saya', email: 'me@pcp.id' }], to: [{ email: 'me@pcp.id' }], subject: 'x', parts: null },
    { ...base, mode: 'replyAll' });
  eq(r.to, 'Saya <me@pcp.id>', 'fallback ke pengirim bila semua terbuang');
}
// forward
{
  const atts = [{ name: 'a.pdf', type: 'application/pdf', size: 10, data: 'QUJD' }];
  const r = buildReplyData(message, { ...base, mode: 'forward', attachments: atts });
  eq(r.composeMode, 'forward');
  eq(r.to, ''); eq(r.cc, '');
  eq(r.subject, 'Fwd: RE: Laporan <Q3>', 'forward atas balasan: Fwd: RE: dipertahankan');
  assert.deepEqual(r.attachments, atts); pass++;
  ok(r.body.includes('Pesan Diteruskan'), 'judul forward di header kutipan');
}
// forward tanpa attachments → []
eq(buildReplyData(message, { ...base, mode: 'forward' }).attachments.length, 0);
// attachments diabaikan utk reply
eq(buildReplyData(message, { ...base, mode: 'reply', attachments: [{ name: 'x' }] }).attachments.length, 0, 'reply tidak membawa lampiran');
// bodyHtml override (reader mengirim HTML yang sudah disanitasi)
{
  const r = buildReplyData(message, { ...base, mode: 'reply', bodyHtml: '<p>bersih</p>' });
  ok(r.body.includes('<p>bersih</p>') && !r.body.includes('Isi <b>asli'), 'bodyHtml dipakai menggantikan parts');
}
// threading dari field JSON
{
  const r = buildReplyData({ ...message, messageId: '<m1@pcp.id>', references: '<r0@pcp.id>' }, { ...base, mode: 'reply' });
  eq(r.inReplyTo, '<m1@pcp.id>');
  eq(r.references, '<r0@pcp.id> <m1@pcp.id>', 'References = asal + Message-ID asal');
}
// threading dari header mentah (viewsource) — menang atas JSON
{
  const r = buildReplyData(message, { ...base, mode: 'forward', headers: { messageId: '<h@pcp.id>', references: '<a@pcp.id> <h@pcp.id>' } });
  eq(r.inReplyTo, '<h@pcp.id>');
  eq(r.references, '<a@pcp.id> <h@pcp.id>', 'tidak digandakan bila Message-ID sudah ada di References');
}
// text/plain → dibungkus pre-wrap oleh extractHtml
{
  const r = buildReplyData({ from: [{ email: 'a@x.id' }], subject: 's', parts: { contentType: 'text/plain', content: 'baris' } }, { ...base, mode: 'reply' });
  ok(r.body.includes('white-space:pre-wrap'), 'plain dibungkus pre-wrap');
}
// mode tidak dikenal → throw
assert.throws(() => buildReplyData(message, { ...base, mode: 'bogus' }), /mode tidak dikenal/); pass++;
// pesan kosong/null tidak crash
{
  const r = buildReplyData(null, { ...base, mode: 'reply' });
  eq(r.to, ''); eq(r.subject, 'Re: (Tanpa Subjek)');
}

// ── buildReplyDataAsync — lampiran forward + viewsource lazy ─────────────────
{
  const calls = [];
  const api = {
    fetchMessage: async (t, f, u) => { calls.push(['fetchMessage', f, u]); return {
      ...message,
      parts: { contentType: 'multipart/mixed', content: [
        { contentType: 'text/html', content: '<p>x</p>' },
        { contentType: 'application/pdf', filename: 'lap.pdf', size: '1 KB', downloadURL: '/dl/1', shouldDisplayAttachment: 1 },
        { contentType: 'image/png', filename: 'logo.png', downloadURL: '/dl/2', shouldDisplayAttachment: 0 },
      ] },
    }; },
    fetchAttachmentData: async (url) => { calls.push(['fetchAttachmentData', url]); return 'QUJD'; },
    fetchMessageHeadersRaw: async (t, f, u) => { calls.push(['viewsource', f, u]); return { messageId: '<vs@pcp.id>', references: '<p@pcp.id>' }; },
  };
  const progress = [];
  const r = await buildReplyDataAsync('tok', 'folderINBOX', 7, { mode: 'forward', userEmail: 'me@pcp.id', api, onProgress: (d, t) => progress.push([d, t]) });
  eq(r.composeMode, 'forward');
  eq(r.attachments.length, 1, 'hanya lampiran tampil (inline CID flag 0 dilewati)');
  assert.deepEqual(r.attachments[0], { name: 'lap.pdf', type: 'application/pdf', size: '1 KB', data: 'QUJD' }); pass++;
  assert.deepEqual(progress, [[1, 1]]); pass++;
  ok(calls.some((c) => c[0] === 'viewsource'), 'viewsource dipanggil karena /view tanpa Message-ID');
  eq(r.inReplyTo, '<vs@pcp.id>');
  eq(r.references, '<p@pcp.id> <vs@pcp.id>');
  eq(r.sourceFolder, 'folderINBOX'); eq(r.sourceUid, 7);

  // message sudah ada + messageId → tidak fetch ulang, tidak viewsource
  calls.length = 0;
  const r2 = await buildReplyDataAsync('tok', 'folderINBOX', 8, { mode: 'reply', api, message: { ...message, messageId: '<j@pcp.id>' } });
  eq(calls.length, 0, 'tidak ada request bila message + Message-ID tersedia');
  eq(r2.inReplyTo, '<j@pcp.id>');

  // viewsource gagal → tetap sukses tanpa threading
  const api3 = { ...api, fetchMessageHeadersRaw: async () => { throw new Error('500'); } };
  const r3 = await buildReplyDataAsync('tok', 'folderINBOX', 9, { mode: 'reply', api: api3, message });
  eq(r3.inReplyTo, '', 'gagal viewsource tidak menggagalkan balasan');

  // lampiran gagal diunduh → throw (reader menampilkan toast)
  const api4 = { ...api, fetchAttachmentData: async () => { throw new Error('gagal unduh'); } };
  await assert.rejects(() => buildReplyDataAsync('tok', 'folderINBOX', 7, { mode: 'forward', api: api4 }), /gagal unduh/); pass++;
}

console.log(`test-reply-builder: ${pass} assertion OK`);
