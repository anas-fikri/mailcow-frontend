import assert from 'node:assert/strict';
import {
  COMPOSE_MODES, normalizeComposeMode, isReplyLikeMode, signatureModeFor,
  composeTitle, composeWindowTitle, composeAriaLabel,
  stripQuotedHtml, mentionsAttachment, needsAttachmentReminder,
  splitRecipients, joinRecipients, parseRecipientChip, dedupeRecipients, addRecipients,
  looksLikeRecipientList, firstInvalidChip,
  formatLocalDateTimeInput, parseLocalDateTimeInput, formatScheduleLabel, formatCountdown,
  buildReopenSnapshot, hasMeaningfulDraftContent, hasMeaningfulBodyText,
} from '../src/lib/composeUtils.js';

let passCount = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passCount++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); passCount++; };

// ── Mode compose ─────────────────────────────────────────────────────────────
eq(COMPOSE_MODES, ['new', 'reply', 'replyAll', 'forward', 'draft']);
eq(normalizeComposeMode('forward'), 'forward');
eq(normalizeComposeMode('apa-ini'), 'new', 'mode asing → new');
eq(normalizeComposeMode(undefined), 'new');
ok(isReplyLikeMode('reply') && isReplyLikeMode('replyAll'), 'reply/replyAll = reply-like');
ok(!isReplyLikeMode('forward'), 'forward BUKAN reply-like (caret tidak ikut preferensi posisi balasan)');
ok(!isReplyLikeMode('new') && !isReplyLikeMode('draft'));
eq(signatureModeFor('reply'), 'reply');
eq(signatureModeFor('replyAll'), 'reply');
eq(signatureModeFor('forward'), 'reply', 'forward memakai signature reply (perilaku lama dipertahankan)');
eq(signatureModeFor('new'), 'new');
eq(signatureModeFor('draft'), 'new');
eq(composeTitle('new'), 'Pesan Baru');
eq(composeTitle('reply'), 'Balas');
eq(composeTitle('replyAll'), 'Balas Semua');
eq(composeTitle('forward'), 'Teruskan');
eq(composeTitle('draft'), 'Ubah Draf');
eq(composeWindowTitle('draft', 'Laporan Q3'), 'Ubah Draf — Laporan Q3');
eq(composeWindowTitle('new', '   '), 'Pesan Baru', 'subjek kosong → judul saja');
eq(composeAriaLabel('forward', 'Fwd: Invoice'), 'Teruskan pesan: Fwd: Invoice');
eq(composeAriaLabel('new'), 'Tulis pesan baru');

// ── Pengingat lampiran ───────────────────────────────────────────────────────
eq(stripQuotedHtml('<p>Halo</p><blockquote>file terlampir</blockquote>'), 'Halo', 'kutipan dibuang');
eq(stripQuotedHtml('<p>a&nbsp;b</p>'), 'a b');
ok(mentionsAttachment('Berikut file terlampir'), 'kata ID "terlampir"');
ok(mentionsAttachment('Please see the attached file'), 'kata EN "attached"');
ok(mentionsAttachment('cek lampiran ya'), 'kata "lampiran"');
ok(!mentionsAttachment('attachmentsX bukan kata utuh'), 'batas kata dihormati');
ok(needsAttachmentReminder({ subject: 'Lampiran invoice', body: '', attachments: [] }), 'subjek menyebut lampiran, tanpa file → ingatkan');
ok(needsAttachmentReminder({ subject: '', body: '<p>File <b>terlampir</b>.</p>', attachments: [] }), 'body menyebut → ingatkan');
ok(!needsAttachmentReminder({ subject: 'Lampiran', body: '', attachments: [{ name: 'a.pdf' }] }), 'ada lampiran → tidak perlu');
ok(!needsAttachmentReminder({ subject: 'Re: hal', body: '<p>oke</p><blockquote>lihat lampiran</blockquote>', attachments: [] }),
  'kata "lampiran" HANYA di kutipan balasan → tidak perlu (false positive dihindari)');
ok(!needsAttachmentReminder({}), 'kosong → tidak perlu');

// ── Chip penerima ────────────────────────────────────────────────────────────
eq(splitRecipients('a@x.com, b@y.com; c@z.com\nd@w.com'), ['a@x.com', 'b@y.com', 'c@z.com', 'd@w.com'], 'koma/titik koma/baris baru');
eq(splitRecipients('"Doe, John" <j@x.com>, b@y.com'), ['"Doe, John" <j@x.com>', 'b@y.com'], 'koma dalam kutip tidak memecah');
eq(splitRecipients('a@x.com b@y.com'), ['a@x.com', 'b@y.com'], 'alamat polos dipisah spasi');
eq(splitRecipients('Budi Santoso <budi@x.com>'), ['Budi Santoso <budi@x.com>'], 'nama berspasi tetap satu entri');
eq(splitRecipients(''), []);
eq(splitRecipients(null), []);
eq(joinRecipients(['a@x.com', ' b@y.com ', '']), 'a@x.com, b@y.com');

let chip = parseRecipientChip('Budi Santoso <Budi@X.com>');
ok(chip.valid, 'nama <email> valid');
eq(chip.name, 'Budi Santoso');
eq(chip.email, 'budi@x.com', 'email lowercase');
chip = parseRecipientChip('"Doe, John" <j@x.com>');
eq(chip.name, 'Doe, John', 'kutip dilepas dari nama');
chip = parseRecipientChip('a@x.com');
ok(chip.valid && chip.name === '' && chip.email === 'a@x.com');
chip = parseRecipientChip('bukan-email');
ok(!chip.valid && /tidak memiliki @/.test(chip.error), 'tanpa @ → error menyebut @');
chip = parseRecipientChip('a@x');
ok(!chip.valid && chip.error.includes('"a@x"'), 'domain tanpa titik → tidak valid (aturan klien), error menyebut alamat');
chip = parseRecipientChip('a b@x.com');
ok(!chip.valid, 'spasi di alamat polos → tidak valid');
chip = parseRecipientChip('x@y.com\r\nBcc: evil@z.com');
ok(!chip.valid, 'karakter kontrol (header injection) → tidak valid');
chip = parseRecipientChip('');
ok(!chip.valid && chip.error === 'Alamat kosong.');

eq(dedupeRecipients(['a@x.com', 'A@X.COM', 'Budi <a@x.com>', 'b@y.com']), ['a@x.com', 'b@y.com'], 'dedup case-insensitive per alamat');
eq(addRecipients(['a@x.com'], 'A@x.com, b@y.com; c@z.com'), ['a@x.com', 'b@y.com', 'c@z.com'], 'tempel daftar → chip baru tanpa duplikat');
ok(looksLikeRecipientList('a@x.com, b@y.com'));
ok(!looksLikeRecipientList('a@x.com'));
eq(firstInvalidChip('a@x.com, b@y.com'), null, 'semua valid → null');
eq(firstInvalidChip('a@x.com, salah, b@y.com')?.raw, 'salah', 'entri pertama yang salah');
eq(firstInvalidChip(''), null);

// ── Tanggal & waktu lokal ────────────────────────────────────────────────────
const local = new Date(2026, 9, 12, 8, 5, 0, 0); // 12 Okt 2026 08:05 lokal
eq(formatLocalDateTimeInput(local), '2026-10-12T08:05', 'format lokal utk datetime-local');
eq(formatLocalDateTimeInput('bukan tanggal'), '', 'invalid → kosong');
// Round-trip lokal: parse(format(d)) === d (tanpa pergeseran zona — bug lama toISOString).
eq(new Date(parseLocalDateTimeInput('2026-10-12T08:05')).getTime(), local.getTime(), 'parse datetime-local = waktu lokal');
eq(parseLocalDateTimeInput(''), '');
eq(parseLocalDateTimeInput('garbage'), '');
// Bukti bug lama: toISOString().slice(0,16) ≠ nilai lokal bila offset zona ≠ 0.
if (local.getTimezoneOffset() !== 0) {
  ok(local.toISOString().slice(0, 16) !== formatLocalDateTimeInput(local), 'UTC slice berbeda dari lokal (bug lama)');
} else {
  passCount++;
}

const now = new Date(2026, 9, 10, 9, 0);
eq(formatScheduleLabel(new Date(2026, 9, 10, 18, 0), now), 'hari ini 18:00');
eq(formatScheduleLabel(new Date(2026, 9, 11, 8, 0), now), 'besok 08:00');
eq(formatScheduleLabel(new Date(2026, 9, 12, 8, 0), now), 'Sen, 12 Okt 08:00', 'tanggal + jam');
eq(formatScheduleLabel(new Date(2027, 0, 3, 7, 30), now), 'Min, 3 Jan 2027 07:30', 'beda tahun → tahun ikut');
eq(formatScheduleLabel('invalid', now), '');
eq(formatScheduleLabel(new Date(2026, 9, 12, 8, 0).getTime(), now), 'Sen, 12 Okt 08:00', 'epoch ms diterima');

eq(formatCountdown(45_000), '0:45');
eq(formatCountdown(125_000), '2:05');
eq(formatCountdown(3_600_000), '1:00:00', '>= 60 menit → format jam');
eq(formatCountdown(4_530_000), '1:15:30');
eq(formatCountdown(-5), '0:00', 'negatif → nol');
eq(formatCountdown(NaN), '0:00');

// ── Snapshot utk "Urungkan" ──────────────────────────────────────────────────
const snap = buildReopenSnapshot({
  composeMode: 'replyAll', to: 'a@x.com', cc: '', bcc: 'b@y.com', subject: 'Re: hal', body: '<p>isi</p>',
  attachments: [{ id: 3, name: 'f.pdf', type: 'application/pdf', size: 10, data: 'QUJD', pending: false }],
  inReplyTo: '<id@x>', references: '<r1@x> <id@x>', sourceFolder: 'INBOX', sourceUid: 42, editorMode: 'plain',
  sendAt: '2026-10-12T01:00:00.000Z',
});
eq(snap.composeMode, 'replyAll', 'mode asli dipertahankan');
eq(snap.attachments, [{ name: 'f.pdf', type: 'application/pdf', size: 10, data: 'QUJD' }], 'lampiran dibawa tanpa id/pending');
eq(snap.inReplyTo, '<id@x>');
eq(snap.references, '<r1@x> <id@x>');
eq(snap.sourceFolder, 'INBOX');
eq(snap.sourceUid, 42);
eq(snap.editorMode, 'plain');
eq(snap.sendAt, '2026-10-12T01:00:00.000Z');
const snapEmpty = buildReopenSnapshot({});
eq(snapEmpty.composeMode, 'new');
ok(!('sendAt' in snapEmpty), 'tanpa jadwal → tanpa sendAt');
eq(snapEmpty.attachments, []);

// ── hasMeaningfulDraftContent: gerbang autosave (QA 2026-10-11) ──────────────
// Penerima saja TIDAK cukup → tidak ada draft yatim di folder Draf.
{
  const SIG = '<p>Salam,<br>Andi Pratama<br>Example Corp</p>';
  ok(!hasMeaningfulDraftContent({}), 'kosong → tidak bermakna');
  ok(!hasMeaningfulDraftContent({ subject: '   ', body: '' }), 'subjek spasi saja → tidak bermakna');
  ok(hasMeaningfulDraftContent({ subject: 'Laporan' }), 'subjek → bermakna');
  ok(hasMeaningfulDraftContent({ attachments: [{ name: 'a.pdf' }] }), 'lampiran → bermakna');
  // Body hanya signature tersuntik (rich): "<br>--<br>" + signature
  ok(!hasMeaningfulDraftContent({ body: `<br>--<br>${SIG}`, signatures: [SIG] }), 'body = signature saja (dikenal) → tidak bermakna');
  ok(!hasMeaningfulDraftContent({ body: `<br>--<br>${SIG}` }), 'body = signature saja (tak dikenal, pemisah --) → tidak bermakna');
  ok(!hasMeaningfulDraftContent({ body: `<p><br></p><p>&nbsp;</p><br>--<br>${SIG}` }), 'paragraf kosong + signature → tidak bermakna');
  // Mode teks polos: "\n--\n" + signature
  ok(!hasMeaningfulDraftContent({ body: '\n--\nSalam,\nAndi' }), 'plain: signature saja → tidak bermakna');
  ok(hasMeaningfulDraftContent({ body: 'Halo Pak\n--\nSalam,\nAndi' }), 'plain: teks sebelum signature → bermakna');
  // Teks user sebelum signature
  ok(hasMeaningfulDraftContent({ body: `<p>Mohon dicek.</p><br>--<br>${SIG}`, signatures: [SIG] }), 'teks + signature → bermakna');
  // Signature dikenal: teks SETELAH signature tetap dihitung
  ok(hasMeaningfulBodyText(`<br>--<br>${SIG}<p>PS: lampiran menyusul</p>`, [SIG]), 'teks setelah signature dikenal → bermakna');
  // Body tanpa signature
  ok(hasMeaningfulBodyText('<div>ok</div>'), 'teks pendek → bermakna');
  ok(!hasMeaningfulBodyText('<div><br></div>'), 'hanya markup kosong → tidak bermakna');
  ok(!hasMeaningfulBodyText(null), 'null aman');
  // Penerima diabaikan (bukan field helper) — kontrak eksplisit
  ok(!hasMeaningfulDraftContent({ to: 'budi@x.id', cc: 'ani@x.id', body: '' }), 'penerima saja → tidak bermakna');
}

console.log('\ncomposeUtils: ' + passCount + ' assertions PASS ✅');
