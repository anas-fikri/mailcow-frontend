// ── Unit test: race undo-delete di MailPage ─────────────────────────────────
// REGRESI: timer undo-delete (6 dtk) bisa fire SETELAH user pindah folder.
// moveMutation dulu memakai selectedFolder SAAT INI → UID yang sama di folder
// baru (pesan BERBEDA — UID per-folder SOGo) ikut terpindah ke Sampah.
// Fix: scheduleDelete mengunci sourceFolder asal; moveMutation memakai
// vars.sourceFolder (fallback selectedFolder utk pemanggil lain).
// Plus: seleksi di-bersihkan saat pesan DIJADWALKAN hapus (bukan saat move
// sukses) — cegah double-schedule / aksi bulk lain menyentuh uid pending.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const mail = fs.readFileSync(path.join(ROOT, 'src/pages/MailPage.jsx'), 'utf8');

let pass = 0;
const ok = (cond, name) => { assert.ok(cond, name); pass++; console.log(`  ✓ ${name}`); };

// ── 1. sourceFolder dikunci saat penjadwalan ────────────────────────────────
ok(mail.includes('const sourceFolder = selectedFolder;'),
  'scheduleDelete mengunci sourceFolder saat penjadwalan');
ok(mail.includes('moveMutation.mutate({ uids, sourceFolder, targetFolder: trashFolder });'),
  'timer undo-delete mengirim sourceFolder eksplisit');
ok(/mutationFn: \(\{ uids, sourceFolder = selectedFolder, targetFolder \}\)/ .test(mail),
  'moveMutation memakai vars.sourceFolder (fallback selectedFolder)');
ok(mail.includes('moveMessages(user.sogoToken, sourceFolder, uids, targetFolder)'),
  'move ke folder ASAL, bukan folder yang sedang dibuka');

// ── 2. Snooze + invalidasi ikut memakai folder asal ─────────────────────────
ok(mail.includes('const clearSnoozesForMoved = (uids, folder = selectedFolder) =>'),
  'clearSnoozesForMoved terima folder eksplisit');
ok(mail.includes('unsnoozeMessages(user.email, folder, uids)'),
  'snooze dibersihkan di folder ASAL');
ok(mail.includes("queryClient.invalidateQueries({ queryKey: ['messages', user.sogoToken, vars?.sourceFolder || selectedFolder] })"),
  'invalidasi cache folder ASAL');

// ── 3. Seleksi dibersihkan saat dijadwalkan (bukan saat sukses move) ────────
ok(mail.includes('// Pesan sudah DIJADWALKAN hapus') &&
  /const bulkDeleteMutation = useMutation\(\{[\s\S]*?onSuccess: \(\) => \{[\s\S]*?setSelectedUids\(\[\]\);/.test(mail),
  'bulkDeleteMutation membersihkan seleksi saat menjadwalkan hapus');

console.log(`\nUndo-delete race: ${pass} assertions PASS ✅`);
