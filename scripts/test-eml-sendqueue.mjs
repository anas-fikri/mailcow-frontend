// ── Unit test: emlUtils (parse/build .eml) + sendQueue (undo/schedule) ───────
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSendQueue, buildQueueEntry, dueEntries, pendingForUser, canCancel, encryptCredentials, decryptCredentials, maxScheduleMs, SEND_QUEUE_STATUS } from '../src/lib/sendQueue.js';
import { parseEmlContent, buildEml, htmlToText } from '../src/lib/emlUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const mailPage = fs.readFileSync(path.join(ROOT, 'src/pages/MailPage.jsx'), 'utf8');
const composeModal = fs.readFileSync(path.join(ROOT, 'src/components/mailer/ComposeModal.jsx'), 'utf8');
const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(ROOT, 'src/lib/api.js'), 'utf8');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── 1. sendQueue: enkripsi kredensial ────────────────────────────────────────
{
  const secret = 'test-secret-key';
  const cred = encryptCredentials(secret, { user: 'a@b.com', pass: 's3cret' });
  ok(cred.v === 1 && cred.iv && cred.tag && cred.data, 'encryptCredentials menghasilkan v/iv/tag/data');
  const dec = decryptCredentials(secret, cred);
  ok(dec.user === 'a@b.com' && dec.pass === 's3cret', 'decryptCredentials mengembalikan user+pass asli');
  let threw = false;
  try { decryptCredentials('wrong-key', cred); } catch { threw = true; }
  ok(threw, 'kunci salah → decrypt gagal (AES-GCM auth)');
}

// ── 2. sendQueue: entry lifecycle ─────────────────────────────────────────────
{
  const tmp = path.join(os.tmpdir(), `pcp-sendqueue-${Date.now()}.json`);
  const q = createSendQueue({ filePath: tmp });
  const entry = buildQueueEntry({
    user: 'a@b.com',
    sendAt: Date.now() + 120_000,
    payload: { to: 'x@y.com', subject: 'Halo', body: 'Tes', attachments: [] },
    cred: { v: 1, iv: 'i', tag: 't', data: 'd' },
  });
  q.add(entry);
  ok(q.find(entry.id)?.user === 'a@b.com', 'add + find bekerja');

  // dueEntries: belum due (masa depan) → kosong
  ok(dueEntries(q.list()).length === 0, 'entry belum due → tidak terkirim');
  // pendingForUser menampilkan utk user terkait
  const pending = pendingForUser(q.list(), 'a@b.com');
  ok(pending.length === 1 && pending[0].subject === 'Halo', 'pendingForUser menampilkan entry user');
  ok(pendingForUser(q.list(), 'lain@b.com').length === 0, 'user lain tidak melihat entry');
  // canCancel: masih pending & belum due → bisa dibatalkan
  ok(canCancel(entry), 'entry belum due → bisa dibatalkan (undo)');
  // cancel: remove
  q.remove(entry.id);
  ok(q.find(entry.id) === null, 'remove menghapus entry (undo sukses)');

  // due di masa lalu → siap kirim
  const due = buildQueueEntry({ user: 'a@b.com', sendAt: Date.now() - 1000, payload: { to: 'x@y.com', subject: 'Due' }, cred: {} });
  q.add(due);
  ok(dueEntries(q.list()).length === 1, 'entry yang sudah due → siap di-flush');
  ok(!canCancel(due), 'entry sudah due → tidak bisa di-undo');
  fs.rmSync(tmp, { force: true });
}

// ── 3. maxScheduleMs ──────────────────────────────────────────────────────────
{
  ok(maxScheduleMs('') === 7 * 24 * 3600 * 1000, 'default horizon 7 hari');
  ok(maxScheduleMs('3600000') === 3600000, 'env horizon dipakai');
  ok(maxScheduleMs('abc') === 7 * 24 * 3600 * 1000, 'env tidak valid → fallback 7 hari');
}

// ── 4. server.js: route undo/pending + sendAt ────────────────────────────────
{
  ok(serverJs.includes("sendAt: z.string().max(40).optional()"), 'server.js schema menerima sendAt');
  ok(serverJs.includes("app.post('/api/send/undo'"), 'route POST /api/send/undo ada');
  ok(serverJs.includes("app.get('/api/send/pending'"), 'route GET /api/send/pending ada');
  ok(serverJs.includes('flushDueSends'), 'flush loop dipanggil');
  ok(serverJs.includes('encryptCredentials(QUEUE_SECRET'), 'kredensial dienkripsi sebelum queue');
}

// ── 5. api.js: sendAt + undo/pending client ──────────────────────────────────
{
  ok(apiJs.includes('sendAt'), 'api.js sendMessage meneruskan sendAt');
  ok(apiJs.includes('export async function undoScheduledSend'), 'api.js undoScheduledSend ada');
  ok(apiJs.includes('export async function getPendingSends'), 'api.js getPendingSends ada');
}

// ── 6. MailPage: badge terjadwal + panel ─────────────────────────────────────
{
  ok(mailPage.includes('pendingSends'), 'MailPage punya state pendingSends');
  ok(mailPage.includes("getPendingSends()"), 'MailPage polling getPendingSends');
  ok(mailPage.includes('Terjadwal ({pendingSends.length})'), 'badge Terjadwal dirender');
  ok(mailPage.includes('undoScheduledSend(p.id)'), 'panel batalkan panggil undoScheduledSend');
}

// ── 7. ComposeModal: jadwal + undo toast ─────────────────────────────────────
{
  ok(composeModal.includes('schedulePick'), 'ComposeModal punya state schedulePick');
  ok(composeModal.includes('sendAt: schedulePick'), 'sendAt diteruskan saat terjadwal');
  ok(composeModal.includes('undoScheduledSend(id)'), 'toast undo memanggil undoScheduledSend');
  ok(composeModal.includes('nextScheduleDate'), 'helper nextScheduleDate ada');
  ok(composeModal.includes('handleEmlDrop'), 'ComposeModal punya handler .eml drop');
  ok(composeModal.includes('parseEmlContent(text)'), 'ComposeModal parse .eml via emlUtils');
}

// ── 8. MessageReader: export .eml ────────────────────────────────────────────
{
  const reader = fs.readFileSync(path.join(ROOT, 'src/components/mailer/MessageReader.jsx'), 'utf8');
  ok(reader.includes('handleDownloadEml'), 'MessageReader punya handler unduh .eml');
  ok(reader.includes('buildEml('), 'MessageReader buildEml dipakai');
  ok(reader.includes('message/rfc822'), 'blob type message/rfc822');
  ok(reader.includes('fetchAttachmentData(a.downloadURL)'), 'lampiran diunduh utk .eml');
}

// ── 9. emlUtils: parse .eml ──────────────────────────────────────────────────
{
  const eml = [
    'From: "Pengirim" <pengirim@example.com>',
    'To: penerima@example.com',
    'Cc: cc@example.com',
    'Subject: =?UTF-8?B?SGFsbyBEdW5pYQ==?=',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Halo dunia,',
    'ini isi email polos.',
  ].join('\r\n');
  const parsed = parseEmlContent(eml);
  ok(parsed.subject === 'Halo Dunia', `subject MIME-decode: "${parsed.subject}"`);
  ok(parsed.to === 'penerima@example.com', 'to diekstrak');
  ok(parsed.cc === 'cc@example.com', 'cc diekstrak');
  ok(parsed.body.includes('Halo dunia'), 'body plain diekstrak');
  ok(parsed.isHTML === false, 'body plain → isHTML false');
}

// ── 10. emlUtils: parse multipart HTML ───────────────────────────────────────
{
  const b = 'BOUND';
  const eml = [
    'From: a@b.com',
    'To: c@d.com',
    'Subject: Multi',
    `Content-Type: multipart/alternative; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'versi plain',
    `--${b}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<p>versi=20HTML</p>',
    `--${b}--`,
  ].join('\r\n');
  const parsed = parseEmlContent(eml);
  ok(parsed.isHTML === true, 'multipart → isHTML true');
  ok(parsed.body.includes('<p>versi HTML</p>'), `quoted-printable di-decode: ${parsed.body}`);
}

// ── 11. emlUtils: buildEml roundtrip ─────────────────────────────────────────
{
  const eml = buildEml({
    from: 'a@b.com', to: 'c@d.com', subject: 'Tes',
    textBody: 'Halo\nbaris kedua', htmlBody: '<p>Halo</p>',
    attachments: [{ filename: 'f.txt', contentType: 'text/plain', data: Buffer.from('halo').toString('base64') }],
  });
  ok(eml.includes('From: a@b.com'), 'header From ada');
  ok(eml.includes('multipart/mixed'), 'multipart/mixed utk lampiran');
  ok(eml.includes('filename="f.txt"'), 'lampiran ada');
  ok(eml.includes('--') && eml.endsWith('--'), 'boundary ditutup');
  const reparsed = parseEmlContent(eml);
  ok(reparsed.subject === 'Tes' && reparsed.to === 'c@d.com', 'build → parse roundtrip subject/to');
}

// ── 12. emlUtils: htmlToText ─────────────────────────────────────────────────
{
  ok(htmlToText('<p>Halo</p><p>Dunia</p>') === 'Halo\nDunia', 'htmlToText pisah paragraf');
  ok(htmlToText('a<br>b') === 'a\nb', 'htmlToText br → newline');
  ok(htmlToText('<b>bold</b>') === 'bold', 'htmlToText buang tag');
}

console.log(`\n${pass} assertions PASS`);
