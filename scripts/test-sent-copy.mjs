/**
 * test-sent-copy — kontrak sent-copy (round-59) + ketahanan sendQueue.
 *
 * Latar: email terkirim via jalur SMTP proxy TIDAK pernah disalin ke folder
 * Sent (akar keluhan "email terkirim masuk Trash, bukan Sent"). Fix: server
 * menyusun RFC822 yang identik (Message-ID/Date eksplisit) lalu IMAP APPEND
 * ke Sent. Test ini mengunci kontrak:
 *   1. makeMessageId — format & domain.
 *   2. buildSentRaw — header wajib ada (Message-ID/Date/Bcc/lampiran).
 *   3. appendSentCopy — pilih folder, flags \Seen, TIDAK PERNAH melempar.
 *   4. sendQueue — memori sumber kebenaran, save terserialisasi, persist
 *      gagal tidak melempar (regresi email hilang 8b4baf71).
 *
 * Jalankan: npm run test:sent-copy
 */
import assert from 'node:assert/strict';
import { buildSentRaw, appendSentCopy, makeMessageId, SENT_MAILBOX_CANDIDATES } from '../src/lib/sentCopy.js';
import { createSendQueue, buildQueueEntry, dueEntries } from '../src/lib/sendQueue.js';

let passed = 0;
function ok(name) { passed++; console.log('  ✓', name); }

// ── 1. makeMessageId ──────────────────────────────────────────────────────────
{
  const id1 = makeMessageId('bayu.gunawan@pcpexpress.com');
  const id2 = makeMessageId('bayu.gunawan@pcpexpress.com');
  assert.match(id1, /^<[0-9a-f-]{36}@pcpexpress\.com>$/, 'format <uuid@domain>');
  assert.notEqual(id1, id2, 'setiap panggilan unik');
  assert.match(makeMessageId('x@y.co.id'), /@y\.co\.id>$/, 'domain diambil dari alamat');
  ok('makeMessageId: format + domain + unik');
}

// ── 2. buildSentRaw (MailComposer nyata) ──────────────────────────────────────
{
  const raw = await buildSentRaw({
    from: 'bayu.gunawan@pcpexpress.com',
    to: 'tujuan@contoh.example',
    bcc: 'rahasia@contoh.example',
    subject: 'Tes Sent Copy',
    html: '<p>Halo <strong>dunia</strong></p>',
    messageId: '<mid-uji@pcpexpress.com>',
    date: new Date('2026-10-07T08:00:00Z'),
    attachments: [{ filename: 'lampiran.txt', content: Buffer.from('isi lampiran') }],
  });
  assert.ok(Buffer.isBuffer(raw), 'hasil berupa Buffer');
  const text = raw.toString('utf8');
  assert.match(text, /^From: bayu\.gunawan@pcpexpress\.com/m, 'From header');
  assert.match(text, /^To: tujuan@contoh\.example/m, 'To header');
  assert.match(text, /^Subject: Tes Sent Copy/m, 'Subject header');
  assert.match(text, /Message-ID: <mid-uji@pcpexpress\.com>/, 'Message-ID eksplisit dipertahankan');
  assert.match(text, /^Date: /m, 'Date header ada');
  // buildSentRaw = jalur SALINAN SENT: header Bcc wajib ada (standar Sent/Gmail).
  assert.match(text, /^Bcc: rahasia@contoh\.example/m, 'Bcc ikut di salinan Sent');
  assert.match(text, /lampiran\.txt/, 'nama lampiran ada');

  // Tanpa bcc → tidak ada header Bcc.
  const rawNoBcc = await buildSentRaw({ from: 'a@x.co', to: 'b@y.co', subject: 's', text: 'x' });
  assert.doesNotMatch(rawNoBcc.toString('utf8'), /^Bcc:/m, 'tanpa bcc → tanpa header Bcc');

  // bcc berupa array → di-join koma.
  const rawArr = await buildSentRaw({ from: 'a@x.co', to: 'b@y.co', subject: 's', text: 'x', bcc: ['c1@z.co', 'c2@z.co'] });
  assert.match(rawArr.toString('utf8'), /^Bcc: c1@z\.co, c2@z\.co/m, 'bcc array di-join');
  ok('buildSentRaw: header wajib + Message-ID eksplisit + kebijakan Bcc + lampiran');
}

// ── 3. appendSentCopy (fake ImapFlow via DI) ─────────────────────────────────
function fakeImap({ mailboxes = [], failConnect = false, failAppend = false } = {}) {
  const calls = { ctor: [], connect: 0, list: 0, append: [], logout: 0, close: 0 };
  class FakeImapFlow {
    constructor(opts) { calls.ctor.push(opts); }
    async connect() { calls.connect++; if (failConnect) throw new Error('koneksi ditolak'); }
    async list() { calls.list++; return mailboxes; }
    async append(mailbox, raw, flags) {
      // imapflow v2: append(path, content, flags, idate) — flags argumen ke-3.
      calls.append.push({ mailbox, bytes: raw.length, flags });
      if (failAppend) throw new Error('APPEND gagal');
      return { uid: 42 };
    }
    async logout() { calls.logout++; }
    close() { calls.close++; }
  }
  return { FakeImapFlow, calls };
}

const RAW = Buffer.from('From: a@x.co\r\nSubject: t\r\n\r\nhi');

{
  // 3a. Sent ada → dipakai, flags \Seen, koneksi & logout benar
  const { FakeImapFlow, calls } = fakeImap({ mailboxes: [{ path: 'INBOX' }, { path: 'Sent' }, { path: 'Trash' }] });
  const res = await appendSentCopy(
    { user: 'u@x.co', pass: 'p', raw: RAW, host: 'mail.x.co', port: 993, secure: true, mailboxes: SENT_MAILBOX_CANDIDATES },
    { ImapFlow: FakeImapFlow },
  );
  assert.equal(res.ok, true, 'ok=true');
  assert.equal(res.mailbox, 'Sent', 'folder Sent dipilih');
  assert.equal(res.uid, 42, 'uid diteruskan');
  assert.deepEqual(calls.append[0].flags, ['\\Seen'], 'flag \\Seen');
  assert.equal(calls.ctor[0].auth.user, 'u@x.co', 'auth user');
  assert.equal(calls.ctor[0].host, 'mail.x.co', 'host');
  assert.equal(calls.connect, 1, 'connect dipanggil');
  assert.equal(calls.logout, 1, 'logout dipanggil');
  ok('appendSentCopy: pilih Sent + flags \\Seen + logout');
}

{
  // 3b. Sent tidak ada → fallback kandidat berikutnya (case-insensitive)
  const { FakeImapFlow, calls } = fakeImap({ mailboxes: [{ path: 'INBOX' }, { path: 'INBOX/sent' }] });
  const res = await appendSentCopy(
    { user: 'u@x.co', pass: 'p', raw: RAW, host: 'h', mailboxes: SENT_MAILBOX_CANDIDATES },
    { ImapFlow: FakeImapFlow },
  );
  assert.equal(res.ok, true, 'ok=true');
  assert.equal(res.mailbox, 'INBOX/sent', 'fallback INBOX/Sent case-insensitive');
  assert.equal(calls.append[0].mailbox, 'INBOX/sent', 'APPEND ke folder fallback');
  ok('appendSentCopy: fallback kandidat case-insensitive');
}

{
  // 3c. Tidak ada folder Sent sama sekali → ok:false, TIDAK melempar
  const { FakeImapFlow, calls } = fakeImap({ mailboxes: [{ path: 'INBOX' }] });
  const res = await appendSentCopy(
    { user: 'u@x.co', pass: 'p', raw: RAW, host: 'h' },
    { ImapFlow: FakeImapFlow },
  );
  assert.equal(res.ok, false, 'ok=false');
  assert.match(res.error, /tidak ditemukan/i, 'pesan error jelas');
  assert.equal(calls.append.length, 0, 'tidak ada APPEND');
  assert.equal(calls.logout, 1, 'logout tetap dipanggil (finally)');
  ok('appendSentCopy: folder tidak ada → ok:false tanpa throw');
}

{
  // 3d. Connect gagal → ok:false (kirim TIDAK boleh ikut gagal)
  const { FakeImapFlow } = fakeImap({ failConnect: true });
  const res = await appendSentCopy(
    { user: 'u@x.co', pass: 'p', raw: RAW, host: 'h' },
    { ImapFlow: FakeImapFlow },
  );
  assert.equal(res.ok, false, 'ok=false');
  assert.match(res.error, /koneksi ditolak/, 'error diteruskan sbg pesan');
  ok('appendSentCopy: connect gagal → ok:false tanpa throw');
}

{
  // 3e. APPEND gagal → ok:false
  const { FakeImapFlow } = fakeImap({ mailboxes: [{ path: 'Sent' }], failAppend: true });
  const res = await appendSentCopy(
    { user: 'u@x.co', pass: 'p', raw: RAW, host: 'h' },
    { ImapFlow: FakeImapFlow },
  );
  assert.equal(res.ok, false, 'ok=false');
  assert.match(res.error, /APPEND gagal/, 'error APPEND diteruskan');
  ok('appendSentCopy: APPEND gagal → ok:false tanpa throw');
}

{
  // 3f. Parameter tidak lengkap → ok:false tanpa menyentuh IMAP
  const res = await appendSentCopy({ user: 'u@x.co', pass: '', raw: RAW, host: 'h' }, {});
  assert.equal(res.ok, false, 'ok=false');
  assert.match(res.error, /tidak lengkap/i, 'pesan jelas');
  ok('appendSentCopy: parameter tidak lengkap → ok:false');
}

// ── 4. sendQueue: memori sumber kebenaran + persist tak melempar ─────────────
{
  // 4a. writeFile gagal → mutasi tetap jalan, TIDAK melempar (regresi ENOENT)
  const errors = [];
  const q = createSendQueue({
    filePath: '/tmp/tidak-ada/sendqueue.json',
    readFile: () => null,
    writeFile: () => { throw new Error('ENOENT: no such file or directory, rename'); },
    onSaveError: (e) => errors.push(String(e.message)),
  });
  const entry = buildQueueEntry({ user: 'u@x.co', sendAt: Date.now() + 1000, payload: { to: 'a@b.co' }, cred: {} });
  q.add(entry); // tidak boleh melempar
  assert.equal(q.list().length, 1, 'entry tetap ada di memori walau persist gagal');
  q.remove(entry.id);
  assert.equal(q.list().length, 0, 'remove tetap bekerja');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(errors.length, 2, 'dua kegagalan persist dilaporkan via onSaveError (tidak dilempar)');
  ok('sendQueue: persist gagal → tidak melempar, memori tetap benar');
}

{
  // 4b. Regresi lost-update: add A, add B, remove A → state akhir = [B]
  const writes = [];
  const q = createSendQueue({
    filePath: '/tmp/q.json',
    readFile: () => null,
    writeFile: (p, data) => { writes.push(JSON.parse(data)); },
  });
  const a = buildQueueEntry({ user: 'u@x.co', sendAt: 1, payload: {}, cred: {}, id: 'A' });
  const b = buildQueueEntry({ user: 'u@x.co', sendAt: 2, payload: {}, cred: {}, id: 'B' });
  q.add(a);
  q.add(b);
  q.remove(a.id);
  assert.deepEqual(q.list().map((e) => e.id), ['B'], 'state memori = [B]');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(writes[writes.length - 1].map((e) => e.id), ['B'], 'persist terakhir = state akhir (bukan snapshot lama)');
  ok('sendQueue: tidak ada lost-update antar operasi beruntun');
}

{
  // 4c. Save terserialisasi: penulisan file berurutan (tanpa race tmp/rename)
  const order = [];
  let active = 0;
  const q = createSendQueue({
    filePath: '/tmp/q.json',
    readFile: () => null,
    writeFile: async (p, data) => {
      active++;
      assert.equal(active, 1, 'tidak ada dua penulisan bersamaan');
      order.push(JSON.parse(data).length);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    },
  });
  q.add(buildQueueEntry({ user: 'u', sendAt: 1, payload: {}, cred: {}, id: 'X' }));
  q.add(buildQueueEntry({ user: 'u', sendAt: 2, payload: {}, cred: {}, id: 'Y' }));
  q.remove('X');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(order, [1, 2, 1], 'penulisan berurutan sesuai urutan mutasi');
  ok('sendQueue: save terserialisasi (anti race tmp/rename)');
}

{
  // 4d. Load dari disk saat init + dueEntries tetap bekerja
  const persisted = JSON.stringify([
    buildQueueEntry({ user: 'u@x.co', sendAt: Date.now() - 1000, payload: { to: 'a@b.co' }, cred: {}, id: 'DUE' }),
    buildQueueEntry({ user: 'u@x.co', sendAt: Date.now() + 60000, payload: {}, cred: {}, id: 'NANTI' }),
  ]);
  const q = createSendQueue({ filePath: '/tmp/q.json', readFile: () => persisted, writeFile: () => {} });
  assert.equal(q.list().length, 2, 'entry dari disk dimuat');
  const due = dueEntries(q.list());
  assert.deepEqual(due.map((e) => e.id), ['DUE'], 'hanya entry due yang di-flush');
  ok('sendQueue: init memuat dari disk + dueEntries benar');
}

console.log(`\ntest-sent-copy: ${passed} blok assertion PASS`);
