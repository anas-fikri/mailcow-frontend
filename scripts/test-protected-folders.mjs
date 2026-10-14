// Regresi 2026-10-14: "Gagal menghapus folder (500)" saat menghapus Templates.
// SOGo menampilkan folder khusus Templates (type 'templates') walau mailbox-nya
// tidak ada di IMAP; UI tidak boleh menawarkan hapus untuk folder sistem.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProtectedFolder, flattenMailboxes } from '../src/lib/mailboxTree.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/mail-golden-folders.json', import.meta.url), 'utf8'));
const folders = flattenMailboxes(golden.mailboxes);
const byPath = Object.fromEntries(folders.map((f) => [f.path, f]));

for (const p of ['INBOX', 'Drafts', 'Sent', 'Trash', 'Junk', 'Templates']) {
  assert.ok(byPath[p], `fixture memuat ${p}`);
  assert.equal(isProtectedFolder(byPath[p]), true, `${p} = folder sistem, tidak boleh dihapus`);
}
assert.equal(isProtectedFolder(byPath.Archive), false, 'folder biasa (Archive) boleh dihapus');

// Berdasarkan TIPE dari SOGo walau nama/id dikustomisasi.
assert.equal(isProtectedFolder({ id: 'folderTemplat', type: 'templates' }), true);
assert.equal(isProtectedFolder({ id: 'folderKirim', type: 'sent' }), true);
assert.equal(isProtectedFolder({ id: 'folderINBOX%2FProyek', type: 'folder' }), false, 'subfolder INBOX boleh dihapus');
assert.equal(isProtectedFolder(null), false);

// Kedua jalur UI (menu klik-kanan + tombol hover) memakai helper yang sama.
const mail = readFileSync(new URL('../src/pages/MailPage.jsx', import.meta.url), 'utf8');
assert.equal((mail.match(/const isDefault = isProtectedFolder\(folder\)/g) || []).length, 2, 'menu konteks & tombol hover memakai isProtectedFolder');

console.log('protected-folders: all assertions passed');
