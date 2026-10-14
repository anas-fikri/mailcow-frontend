// Regresi 2026-10-14: "Gagal menghapus folder (500)" saat menghapus Templates.
// SOGo menampilkan folder khusus Templates (type 'templates') walau mailbox-nya
// tidak ada di IMAP; UI tidak boleh menawarkan hapus untuk folder sistem.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProtectedFolder, isInTrash, flattenMailboxes } from '../src/lib/mailboxTree.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/mail-golden-folders.json', import.meta.url), 'utf8'));
const folders = flattenMailboxes(golden.mailboxes);
const byPath = Object.fromEntries(folders.map((f) => [f.path, f]));

for (const p of ['INBOX', 'Drafts', 'Sent', 'Trash', 'Junk', 'Templates']) {
  assert.ok(byPath[p], `fixture memuat ${p}`);
  assert.equal(isProtectedFolder(byPath[p]), true, `${p} = folder sistem, tidak boleh dihapus`);
}
// Archive = mailbox khusus mailcow (dovecot auto=subscribe): dihapus langsung
// dibuat ulang kosong & isinya hilang (insiden 2026-10-14) → dilindungi.
assert.equal(isProtectedFolder(byPath.Archive), true, 'Archive dilindungi');
assert.equal(isProtectedFolder({ id: 'folderProyek', path: 'Proyek', type: 'folder' }), false, 'folder buatan user boleh dihapus');

// Hapus default = pindah ke Sampah; permanen hanya utk folder di dalam Sampah.
assert.equal(isInTrash({ id: 'folderTrash%2FLama', path: 'Trash/Lama' }), true);
assert.equal(isInTrash({ id: 'folderINBOX%2FProyek', path: 'INBOX/Proyek' }), false);
assert.equal(isInTrash({ id: 'folderTrash', path: 'Trash' }), false, 'Sampah itu sendiri bukan "di dalam Sampah"');
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
assert.ok(api.includes('body: JSON.stringify({ withoutTrash: !!permanent })'), 'deleteFolder default ke Sampah (withoutTrash:false)');
assert.ok(/deleteFolder\(sogoToken, folderId, \{ permanent = false \} = \{\}\)/.test(api), 'permanent default false');

// Berdasarkan TIPE dari SOGo walau nama/id dikustomisasi.
assert.equal(isProtectedFolder({ id: 'folderTemplat', type: 'templates' }), true);
assert.equal(isProtectedFolder({ id: 'folderKirim', type: 'sent' }), true);
assert.equal(isProtectedFolder({ id: 'folderINBOX%2FProyek', type: 'folder' }), false, 'subfolder INBOX boleh dihapus');
assert.equal(isProtectedFolder(null), false);

// Kedua jalur UI (menu klik-kanan + tombol hover) memakai helper yang sama.
const mail = readFileSync(new URL('../src/pages/MailPage.jsx', import.meta.url), 'utf8');
assert.equal((mail.match(/const isDefault = isProtectedFolder\(folder\)/g) || []).length, 2, 'menu konteks & tombol hover memakai isProtectedFolder');
assert.ok(mail.includes('permanent: isInTrash(folderDialog.folder)'), 'dialog hapus: permanen hanya bila folder di Sampah');
assert.ok(!mail.includes('Tindakan ini permanen (tidak masuk Sampah)'), 'copy lama (selalu permanen) sudah hilang');

console.log('protected-folders: all assertions passed');
