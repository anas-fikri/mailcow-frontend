// Unit test: filterFoldersForPicker (src/lib/mailSearch.js) — penyaring
// folder utk MoveToPicker (ketik utk filter, buang folder sumber & non-mail).
// Jalankan: node scripts/test-move-picker.mjs
import assert from 'node:assert/strict';
import { filterFoldersForPicker } from '../src/lib/mailSearch.js';

let pass = 0;
const ids = (list) => list.map((f) => f.id);
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); pass++; };

const folders = [
  { id: 'folderINBOX', label: 'Kotak Masuk', path: 'INBOX' },
  { id: 'folderSent', label: 'Terkirim', path: 'Sent' },
  { id: 'folderCalendar', label: 'Calendar', path: 'Calendar' },
  { id: 'folderContacts', label: 'Contacts', path: 'Contacts' },
  { id: 'folderArchive', label: 'Archive', path: 'Archive' },
  { id: 'folderArchive%2F2025', label: '2025', path: 'Archive/2025' },
  { id: 'folderProjects%2FPCP', label: 'PCP', path: 'Projects/PCP' },
];

eq(ids(filterFoldersForPicker(folders)), ['folderINBOX', 'folderSent', 'folderArchive', 'folderArchive%2F2025', 'folderProjects%2FPCP'],
  'tanpa query: semua folder mail (Calendar/Contacts dibuang), urutan asli');
eq(ids(filterFoldersForPicker(folders, '', 'folderINBOX')), ['folderSent', 'folderArchive', 'folderArchive%2F2025', 'folderProjects%2FPCP'],
  'folder sumber dibuang');
eq(ids(filterFoldersForPicker(folders, 'arch')), ['folderArchive', 'folderArchive%2F2025'],
  'query cocok label ATAU path (subfolder 2025 ikut lewat path Archive/2025)');
eq(ids(filterFoldersForPicker(folders, '2025')), ['folderArchive%2F2025'], 'query cocok label subfolder');
eq(ids(filterFoldersForPicker(folders, 'KOTAK')), ['folderINBOX'], 'case-insensitive');
eq(ids(filterFoldersForPicker(folders, '  pcp ')), ['folderProjects%2FPCP'], 'query di-trim');
eq(ids(filterFoldersForPicker(folders, 'zzz')), [], 'tidak ada yang cocok → kosong');
eq(ids(filterFoldersForPicker(null, 'a')), [], 'folders null aman');
eq(ids(filterFoldersForPicker([{ label: 'tanpa id' }, null], '')), [], 'entri tanpa id / null dibuang');

console.log(`move-picker: ${pass} assertions PASS`);
