/**
 * GOLDEN-SAMPLE regression test — replay data produksi SOGo ASLI melalui
 * implementasi parser/formatter nyata yang dipakai MailPage.
 *
 * Latar belakang: bug sort email (RelativeDate "13:36" gagal parse → pesan
 * tenggelam tanpa error) lolos dari E2E flow + audit keamanan karena bug itu
 * ada di lapisan presentasi. Satu-satunya cara andal menangkapnya = capture
 * respons produksi mentah (scripts/capture-mail-golden.sh) lalu jalankan
 * lewat kode nyata. Fixture di scripts/fixtures/mail-golden-*.json adalah
 * respons HTTP 200 PERSIS dari produksi (SOGo 5.12, mailcow), bukan buatan.
 *
 * Jika format SOGo berubah (upgrade), regenerate fixture:
 *   scp scripts/capture-mail-golden.sh deploy-mail:/tmp/ && ssh deploy-mail 'bash /tmp/capture-mail-golden.sh'
 *   scp deploy-mail:'/tmp/golden-*.json' scripts/fixtures/  # rename ke mail-golden-*
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseMessageRows } from '../src/lib/messageRows.js';
import { sortMessagesByDate, applyMessageWindow, getDateGroup } from '../src/lib/dateGroups.js';
import { groupConversations } from '../src/lib/conversations.js';
import { formatAddresses, renderDate } from '../src/lib/format.js';
import { extractHtml, extractAttachments, looksLikeHtmlInPlainText } from '../src/lib/messageHtml.js';
import { parseSizeToBytes, totalAttachmentSize, formatFileSize, getFileKind } from '../src/lib/attachments.js';
import { flattenMailboxes } from '../src/lib/mailboxTree.js';
import { analyzePhishing } from '../src/lib/phishingDetection.js';
import { classifyEmail } from '../src/lib/emailCategory.js';
import { buildMessageSearchBody, MAX_SEARCH_QUERY_LENGTH } from '../src/lib/messageRequests.js';

const here = join(dirname(fileURLToPath(import.meta.url)));
const list = JSON.parse(readFileSync(join(here, 'fixtures/mail-golden-list.json'), 'utf8'));
const detail = JSON.parse(readFileSync(join(here, 'fixtures/mail-golden-detail.json'), 'utf8'));
const folders = JSON.parse(readFileSync(join(here, 'fixtures/mail-golden-folders.json'), 'utf8'));

// ── 1. List rows: format RelativeDate asli produksi ──────────────────────────
// Berisi 4 varian sekaligus: "14:24" (hari ini, jam polos), "04:38" (hari ini,
// dini hari), "Tuesday 14:24" (≤6 hari, English locale), "27-Aug-26" (≥7 hari).
const msgs = parseMessageRows(list);
assert.equal(msgs.length, 4, '4 baris pesan ter-parse');
const byUid = new Map(msgs.map((m) => [m.uid, m]));
assert.equal(byUid.get(9).date, '14:24');
assert.equal(byUid.get(10).date, '27-Aug-26');
assert.equal(byUid.get(11).date, 'Tuesday 14:24');
assert.equal(byUid.get(12).date, '04:38');

// RelativeDate dipetakan dari kolom dinamis, bukan fallback posisi
assert.equal(byUid.get(9).subject, 'Laporan Bulanan Tim');
assert.equal(byUid.get(9).from, 'Anggota Tim <tim@example.com>');
assert.equal(byUid.get(9).hasAtt, true, 'hasAttachment=1 → true (baris dgn lampiran)');

// ── 2. Sort: urutan tanggal benar walau uid terbalik ─────────────────────────
// uid = urutan delivery: 9 < 10 < 11 < 12; tanggal: 9 (14:24) & 12 (04:38)
// hari ini, 11 Selasa, 10 tgl 27 Agu. Sort date-desc HARUS mengabaikan uid.
const now = new Date('2026-09-04T14:30:00');
const sorted = sortMessagesByDate(msgs, { now });
assert.deepEqual(sorted.map((m) => m.uid), [9, 12, 11, 10], 'urutan date-desc benar');
assert.equal(getDateGroup(byUid.get(9).date, now).key, 'today');
// 27-Agu dilihat 4-Sep = bulan kalender sebelumnya → Bulan Lalu (batas kalender, QA 2026-10-11)
assert.equal(getDateGroup(byUid.get(10).date, now).key, 'lastMonth');
assert.equal(getDateGroup(byUid.get(11).date, now).key, 'thisWeek');

// Window 5 bulan tidak membuang pesan yang sah
assert.equal(applyMessageWindow(msgs, { now }).length, 4);

// ── 3. Detail: lampiran (ukuran STRING "144 B") ──────────────────────────────
const atts = extractAttachments(detail.parts);
assert.equal(atts.length, 1, '1 lampiran terdeteksi (plain + pdf; text/plain tak dihitung)');
assert.equal(atts[0].name, 'laporan.pdf');
assert.equal(atts[0].size, '144 B', 'SOGo kirim size string');
assert.equal(atts[0].contentType, 'application/pdf');
assert.ok(atts[0].downloadURL.includes('/asAttachment/laporan.pdf'));

// Ukuran: string "144 B" → 144 bytes; tampilan sub-KB = "N B" (bukan "0 KB")
assert.equal(parseSizeToBytes('144 B'), 144);
assert.equal(parseSizeToBytes('671 B'), 671);
assert.equal(formatFileSize(144), '144 B');
assert.equal(totalAttachmentSize(atts), '144 B');
assert.equal(getFileKind(atts[0].name, atts[0].contentType), 'pdf');

// ── 4. Detail body: plain dibungkus pre-wrap, teks utuh ─────────────────────
const html = extractHtml(detail.parts);
assert.ok(html.includes('laporan bulanan tim'), 'isi plain tampil');

// ── 5. Addresses + phishing: TIDAK false-positive utk email internal ────────
// Shape detail asli: from & reply-to adalah ARRAY of {name,email}, reply-to
// sama dgn from → harus 'safe' (analisa header butuh string terformat).
const fromStr = formatAddresses(detail.from);
const replyStr = formatAddresses(detail['reply-to']);
assert.equal(fromStr, 'Anggota Tim <tim@example.com>');
assert.equal(replyStr, 'Anggota Tim <tim@example.com>');
const ph = analyzePhishing({ from: fromStr, replyTo: replyStr, subject: detail.subject, bodyHtml: html, bodyPlain: '' });
assert.equal(ph.level, 'safe', 'email normal tidak dianggap phishing');

// Positive control: pola phishing klasik tetap terdeteksi (sanity guard)
const phBad = analyzePhishing({
  from: 'PayPal Service <service@paypa1.com>',
  replyTo: 'PayPal Service <collect@evil.xyz>',
  subject: 'Act now! Verify your account immediately',
  bodyHtml: '<p>Enter your password now: http://bit.ly/x</p>',
  bodyPlain: '',
});
assert.notEqual(phBad.level, 'safe', 'contoh phishing nyata terdeteksi');

// ── 6. renderDate: format detail SOGo dgn zona WIB ───────────────────────────
// "Friday, September 04, 2026 14:24 WIB" dulu → NaN → mentah ditampilkan.
// Tanggal fixture HARUS dinamis: renderDate menampilkan jam-saja utk pesan
// "hari ini" (toDateString lokal) — fixture hardcoded pernah time-bomb saat
// tanggal berganti (4 Sep 2026 → 5 Sep 2026 gagal '14.24' vs '4 Sep 2026').
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _now = new Date();
const pad2 = (n) => String(n).padStart(2, '0');
const todayLabel = `${DAY_NAMES[_now.getDay()]}, ${MONTH_NAMES[_now.getMonth()]} ${pad2(_now.getDate())}, ${_now.getFullYear()} 14:24 WIB`;
assert.equal(renderDate(todayLabel), '14.24');
assert.notEqual(renderDate(todayLabel), todayLabel);
assert.equal(renderDate('not-a-date'), 'not-a-date'); // fallback aman
assert.equal(renderDate(''), '');

// ── 7. Folders: 7 mailbox, id valid utk view/move ────────────────────────────
const flat = flattenMailboxes(folders.mailboxes);
assert.equal(flat.length, 7);
assert.ok(flat.every((f) => f.id.startsWith('folder') && f.path && !f.path.includes('/')));
const types = new Set(flat.map((f) => f.type));
for (const t of ['inbox', 'draft', 'sent', 'trash', 'junk']) assert.ok(types.has(t), `type ${t} ada`);

// ── 8. Conversasi: "Re:" merge dgn induk (subject normalization) ─────────────
const convs = groupConversations(sorted);
assert.equal(convs.length, 3, 'Re: Laporan merge dgn induk; 2 subjek lain terpisah');
const thread = convs.find((c) => c.norm === 'laporan bulanan tim');
assert.equal(thread.messages.length, 2, '2 pesan dalam 1 thread');
assert.equal(thread.messages[0].uid, 9, 'preview thread = pesan TERBARU (bukan induk)');
// Agregat lampiran thread: pesan induk (uid 9) berlampiran, reply (uid 10) tidak
assert.equal(thread.hasAttachment, true, 'thread berlampiran walau pesan terbaru polos');
assert.equal(thread.attachmentCount, 1, '1 dari 2 pesan berlampiran');
// Agregat belum-dibaca & flag (fixture: semua isRead=0, isFlagged=0)
assert.equal(thread.unreadCount, 2, '2 pesan belum dibaca dalam thread');
assert.equal(thread.hasFlagged, false, 'tidak ada pesan ditandai di fixture');
assert.equal(thread.flaggedCount, 0, 'flaggedCount 0');

// ── 9. Kategori: domain & no-reply ───────────────────────────────────────────
assert.equal(classifyEmail({ ...byUid.get(11), folderId: 'folderINBOX' }), 'promo');
assert.equal(classifyEmail({ ...byUid.get(12), folderId: 'folderINBOX' }), 'update');
assert.equal(classifyEmail({ ...byUid.get(9), folderId: 'folderJunk' }), 'spam');

// ── 10. Search body builder: kriteria map + cap 500 ─────────────────────────
const sb = buildMessageSearchBody('laporan', 'subject');
assert.equal(sb.filters[0].searchBy, 'subject');
assert.equal(sb.sortingAttributes.sort, 'date');
assert.equal(buildMessageSearchBody('x'.repeat(999)).filters[0].searchInput.length, MAX_SEARCH_QUERY_LENGTH);

console.log('✅ test-mail-golden: semua golden-sample produksi lolos replay');
