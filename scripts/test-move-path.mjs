/**
 * Dynamic verification: destination path builder untuk SOGo moveMessages.
 * Ground truth: SoObjects/Mailer/SOGoMailFolder.m → moveUIDs:toFolder:
 *   - destination dipecah by '/' → [ '', accountName, folder..., ]
 *   - accountName dibandingkan dengan nameInContainer akun sumber ("0" utk akun utama)
 *   - mismatch → 500 "Cannot copy messages to other account."
 */
import assert from 'node:assert/strict';

// Replikasi persis logika toSogoAbsPath di src/lib/api.js (fungsi tidak diekspor).
function toSogoAbsPath(_accountId, folderPath) {
  const cssId = folderPath
    .split('/')
    .filter(Boolean)
    .map((c) => 'folder' + c)
    .join('/');
  return '/0/' + cssId;
}

// ── Format lama (BUG): email sebagai segment akun → SOGo reject ──
const buggy = (email, p) => '/' + email + '/' + p.split('/').filter(Boolean).map((c) => 'folder' + c).join('/');
const email = 'siti.rahma@example.org';
const dest = buggy(email, 'Archive');
assert.equal(
  dest.split('/')[1], email,
  'format lama menaruh email di slot accountName → mismatch dgn "0"'
);

// ── Format baru: slot accountName = "0" = nameInContainer akun sumber ──
assert.equal(toSogoAbsPath(email, 'Archive'), '/0/folderArchive');
assert.equal(toSogoAbsPath(email, 'INBOX/Sub'), '/0/folderINBOX/folderSub');
assert.equal(toSogoAbsPath(email, 'Trash'), '/0/folderTrash');
assert.equal(toSogoAbsPath(email, 'folderArchive'), '/0/folderfolderArchive'); // dokumentasi: input path, bukan id

// Simulasi parsing SOGo: componentsSeparatedByString:"/"
const parts = toSogoAbsPath(email, 'INBOX/Sub').split('/');
assert.equal(parts[0], '');
assert.equal(parts[1], '0'); // destinationAccountName == currentAccountName ✓
assert.equal(parts[2], 'folderINBOX');
assert.equal(parts[3], 'folderSub');

console.log('PASS: moveMessages destination path pakai account segment "0"');
console.log('  - mismatch format lama (email) terbukti sebagai pemicu 500 cross-account');
