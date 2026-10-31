// Percakapan + email Terkirim (Outlook "tampilkan pesan dari folder lain").
// 1) mergeSentIntoGroups (lib murni) 2) pref convIncludeSent 3) kontrak statis
// perlakuan baris salinan Terkirim di MailPage.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { groupConversations, mergeSentIntoGroups } = await import('../src/lib/conversations.js');

const inbox = [
  { uid: 10, subject: 'Penawaran harga', from: 'Budi <budi@x.com>', to: 'me@pcp.id', date: '2026-10-01 09:00', isRead: false },
  { uid: 12, subject: 'RE: Penawaran harga', from: 'Budi <budi@x.com>', to: 'me@pcp.id', date: '2026-10-03 09:00', isRead: true },
  { uid: 11, subject: 'Rapat mingguan', from: 'Sari <sari@x.com>', to: 'me@pcp.id', date: '2026-10-02 09:00', isRead: true },
  { uid: 13, subject: '', from: 'Anon <a@x.com>', to: 'me@pcp.id', date: '2026-10-02 10:00', isRead: true },
];
const sent = [
  // uid 12 sengaja BENTROK dgn uid Kotak Masuk — identitas = folder+uid.
  { uid: 12, subject: 'Re: Penawaran harga', from: 'Me <me@pcp.id>', to: 'Budi <budi@x.com>', date: '2026-10-04 08:00', isRead: true },
  { uid: 5, subject: 'Re: Penawaran harga', from: 'Me <me@pcp.id>', to: 'Budi <budi@x.com>', date: '2026-10-02 08:00', isRead: false },
  { uid: 6, subject: 'Laporan bulanan', from: 'Me <me@pcp.id>', to: 'Bos <bos@x.com>', date: '2026-10-05 08:00', isRead: true },
  { uid: 7, subject: '', from: 'Me <me@pcp.id>', to: 'a@x.com', date: '2026-10-05 08:00', isRead: true },
  { uid: 12, subject: 'Re: Penawaran harga', from: 'Me <me@pcp.id>', to: 'Budi <budi@x.com>', date: '2026-10-04 08:00' }, // duplikat
];

const base = groupConversations(inbox, false, 'me@pcp.id');
const baseSnapshot = JSON.stringify(base.map((g) => [g.key, g.messages.map((m) => m.uid)]));
const merged = mergeSentIntoGroups(base, sent, { folderId: 'folderSent' });

// Tidak ada thread baru yang hanya berisi email terkirim.
assert.equal(merged.length, base.length, 'jumlah thread tetap — tidak ada thread khusus Terkirim');
assert.ok(!merged.some((g) => g.messages.every((m) => m.isSentCopy)), 'tidak ada thread sent-only');
assert.ok(!merged.some((g) => g.messages.some((m) => m.uid === 6 && m.isSentCopy)), 'subjek tidak cocok tidak digabung');
assert.ok(!merged.some((g) => g.messages.some((m) => m.uid === 7 && m.isSentCopy)), 'subjek kosong tidak digabung');

const thread = merged.find((g) => g.norm === 'penawaran harga');
assert.equal(thread.messages.length, 4, '2 inbox + 2 terkirim (duplikat dibuang)');
assert.equal(thread.sentCount, 2);
assert.equal(thread.messages.filter((m) => m.uid === 12).length, 2, 'uid bentrok antar folder tetap 2 pesan berbeda');
const copies = thread.messages.filter((m) => m.isSentCopy);
assert.ok(copies.every((m) => m.folderId === 'folderSent' && m.isRead === true), 'salinan ditandai folderSent + terbaca');
// Urutan: terbaru dulu (tanggal), salinan tersisip di antara pesan Kotak Masuk.
assert.deepEqual(thread.messages.map((m) => `${m.isSentCopy ? 's' : 'i'}${m.uid}`), ['s12', 'i12', 's5', 'i10']);
assert.equal(thread.latest.isSentCopy, true, 'latest = pesan terbaru keseluruhan (Outlook)');
// Agregat unread TIDAK terpengaruh salinan (uid 5 isRead:false di sumber).
assert.equal(thread.unreadCount, 1);
assert.equal(thread.hasUnread, true);
assert.ok(thread.senders.includes('Anda') && thread.senders.filter((x) => x === 'Anda').length === 1, '"Anda" sekali di peserta');
// Urutan grup ikut aktivitas terakhir: thread dgn balasan 10-04 di atas.
assert.equal(merged[0].norm, 'penawaran harga');
// Input tidak dimutasi; grup tanpa tambahan identitasnya tetap.
assert.equal(JSON.stringify(base.map((g) => [g.key, g.messages.map((m) => m.uid)])), baseSnapshot, 'input tidak dimutasi');
const rapat = merged.find((g) => g.norm === 'rapat mingguan');
assert.ok(base.includes(rapat), 'grup tanpa salinan = objek yang sama');
assert.equal(rapat.sentCount, 0);

// Dedupe Message-ID: salinan yang sudah ada di Kotak Masuk (CC diri sendiri).
const withMid = groupConversations([
  { uid: 1, subject: 'Halo', from: 'A <a@x.com>', date: '2026-10-01 09:00', isRead: true },
  { uid: 2, subject: 'Re: Halo', from: 'Me <me@pcp.id>', date: '2026-10-02 09:00', isRead: true, messageId: '<abc@pcp>' },
]);
const midMerged = mergeSentIntoGroups(withMid, [
  { uid: 9, subject: 'Re: Halo', from: 'Me <me@pcp.id>', date: '2026-10-02 09:00', messageId: '<ABC@pcp>' },
]);
assert.equal(midMerged[0].messages.length, 2, 'Message-ID sama → tidak digandakan');

// Kosong / tanpa grup → apa adanya.
assert.deepEqual(mergeSentIntoGroups([], sent), []);
assert.equal(mergeSentIntoGroups(base, []), base);
// asc dihormati.
const mergedAsc = mergeSentIntoGroups(groupConversations(inbox, true, 'me@pcp.id'), sent, { asc: true });
assert.equal(mergedAsc[mergedAsc.length - 1].norm, 'penawaran harga', 'asc: thread terbaru di bawah');

// ── Pref convIncludeSent ────────────────────────────────────────────────────
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
const { DEFAULT_PREFS, loadPrefs, savePrefs } = await import('../src/lib/userPrefs.js');
assert.equal(DEFAULT_PREFS.convIncludeSent, true, 'default ON');
storage.set('pcp_prefs_v2_old@x.com', JSON.stringify({ theme: 'light' }));
assert.equal(loadPrefs('old@x.com').convIncludeSent, true, 'data lama tanpa field → default true');
savePrefs('off@x.com', { convIncludeSent: false });
assert.equal(loadPrefs('off@x.com').convIncludeSent, false, 'false dipertahankan');
storage.set('pcp_prefs_v2_bad@x.com', JSON.stringify({ convIncludeSent: 'yes' }));
assert.equal(loadPrefs('bad@x.com').convIncludeSent, true, 'nilai non-boolean → default');

// ── Kontrak statis MailPage / Preferences / store ───────────────────────────
const mail = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const prefsPage = fs.readFileSync('src/pages/PreferencesPage.jsx', 'utf8');
const store = fs.readFileSync('src/store/authStore.js', 'utf8');
assert.ok(store.includes('convIncludeSent: state.convIncludeSent'), 'store mempersist convIncludeSent');
assert.ok(prefsPage.includes("set('convIncludeSent'") && prefsPage.includes('Tampilkan email terkirim dalam percakapan'), 'switch Preferensi');
assert.ok(mail.includes("queryKey: ['messages', user?.sogoToken, sentFolderId, '', 'all']"), 'query Terkirim memakai bentuk key daftar folder');
assert.ok(/enabled: convSentEnabled &&/.test(mail), 'query Terkirim di-gate');
assert.ok(mail.includes('&& !searchQuery') && mail.includes('convSentFolderEligible'), 'tidak aktif saat search / folder Terkirim-Draf-Sampah-Junk');
assert.ok(mail.includes('mergeSentIntoGroups(groups, convSentCopies'), 'merge dipanggil di conversationGroups');
// Perlakuan baris
assert.ok(mail.includes('<Send size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400"'), 'ikon Send pada salinan');
assert.ok(mail.includes('>Terkirim</span>') && mail.includes('SENT_COPY_CHIP_CLS'), 'chip Terkirim');
assert.ok(mail.includes('{!msg.isRead && !sentCopy && ('), 'tidak ada titik unread utk salinan');
assert.ok(mail.includes('sender: sentCopy ? `Terkirim kepada ${sentRecipients}`'), 'aria-label "Terkirim kepada …"');
assert.ok(mail.includes('displayLabel = `Anda → ${first}'), 'label "Anda → penerima"');
assert.ok(mail.includes("{group.sentCount > 0 && ` · ${group.sentCount} terkirim`}"), 'header: N terkirim');
// Aksi memakai folder baris / folder eksplisit
assert.ok(mail.includes('const isSelected = !sentCopy && selectedUids.includes(msg.uid);'), 'salinan tidak bisa dipilih');
assert.ok(mail.includes('onClick={(e) => (sentCopy ? handleSentCopyClick(e, msg) : handleRowClick(e, msg.uid, idx))}'), 'klik salinan → buka di folder Terkirim');
assert.ok(mail.includes("setSelectedMsg({ uid: msg.uid, folder: msg.folderId || 'folderSent' })"), 'openSentCopy menyimpan folder');
assert.ok(mail.includes('folder={selectedMsgFolder || (searchQuery && activeMessage?.folderId'), 'reader memakai folder salinan');
assert.ok(mail.includes('const runGroups = sentCopy ? (list, fn) => fn(folder, list) : forEachFolderGroup;'), 'menu konteks: folder eksplisit');
assert.ok(mail.includes('const uids = !msg.isSentCopy && selectedUids.includes(msg.uid)'), 'drag salinan = baris itu saja');
assert.ok(mail.includes('g.messages.filter((m) => !m.isSentCopy).map((m) => m.uid)'), 'urutan navigasi tanpa salinan');
assert.ok(mail.includes('if (selectedMsgFolder) return [];'), 'reader prev/next mati utk salinan');
assert.ok(mail.includes('quickReply(msg.uid, rowFolder)') && mail.includes('archiveUids([msg.uid], rowFolder)'), 'aksi hover via rowFolder');
// newMail tetap INBOX-only
const newMail = fs.readFileSync('src/lib/newMail.js', 'utf8');
assert.ok(!/isSentCopy|folderSent/.test(newMail), 'deteksi email baru tidak menyentuh Terkirim');

// 2026-10-29: salinan Terkirim dimuat bertahap (tidak terbatas halaman pertama)
// mengikuti tanggal email terlama folder aktif yang sudah dimuat; tanpa window 5 bulan.
{
  const mailSrc = mail;
  assert.ok(mailSrc.includes('fetchMessageHeaders(user.sogoToken, sentFolderId, remaining.slice(0, 50))'), 'Terkirim tambahan dimuat 50/batch');
  assert.ok(mailSrc.includes('if (!(oldestSent > oldestFolder)) return;'), 'berhenti saat Terkirim sudah menjangkau rentang folder');
  assert.ok(!mailSrc.includes('applyMessageWindow(raw'), 'salinan Terkirim tidak dipotong window 5 bulan');
}

console.log('conv-sent: PASS');
