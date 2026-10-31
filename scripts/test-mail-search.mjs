// Test pencarian lintas folder + empty-state pintar.
// Jalankan: node scripts/test-mail-search.mjs
// searchFn di-inject (dependency injection) — Node tidak perlu memuat api.js.
import assert from 'node:assert/strict';

const { pickSearchableFolders, searchAllFolders, mergeSearchResults, analyzeEmptyList, FILTER_LABELS_ID, GLOBAL_SEARCH } =
  await import('../src/lib/mailSearch.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };

let mockImpl = null;
const searchFn = (token, folder, query, criteria) => mockImpl(token, folder, query, criteria);

// ── pickSearchableFolders ────────────────────────────────────────────────────
{
  const folders = [
    { id: 'folderINBOX', order: 1 },
    { id: 'folderSent', order: 3 },
    { id: 'folderCalendar', order: 2 },
    { id: 'folderContacts', order: 2.5 },
    { id: 'folderTrash', order: 9 },
    { id: 'folderArchive', order: 5 },
  ];
  const picked = pickSearchableFolders(folders);
  ok(picked.length === 4, `pick: buang calendar/contacts (dapat ${picked.length})`);
  ok(picked[0].id === 'folderINBOX', 'pick: urut order (INBOX dulu)');
}

// ── searchAllFolders: folder aktif 0 → expand semua folder ──────────────────
{
  mockImpl = (token, folder) => {
    if (folder === 'folderINBOX') return { messages: [] };
    if (folder === 'folderArchive') {
      return { messages: [{ uid: 7, folderId: 'folderArchive', date: '2026-05-01T10:00:00Z', subject: 'Kontrak lama' }] };
    }
    return { messages: [] };
  };
  const folders = [{ id: 'folderINBOX', order: 1 }, { id: 'folderArchive', order: 5 }];
  const r = await searchAllFolders('tok', 'folderINBOX', 'kontrak', 'subject', folders, { searchFn });
  ok(r.searchedAll === true, 'expand: searchedAll=true saat folder aktif kosong');
  ok(r.messages.length === 1 && r.messages[0].folderId === 'folderArchive', 'expand: hasil folder lain masuk');
}

// ── searchAllFolders: folder aktif ada hasil → tidak expand ─────────────────
{
  mockImpl = (token, folder) =>
    folder === 'folderINBOX'
      ? { messages: [{ uid: 1, folderId: 'folderINBOX', date: '2026-09-01T00:00:00Z', subject: 'a' }] }
      : { messages: [{ uid: 2, folderId: 'folderSent', subject: 'b' }] };
  const r = await searchAllFolders('tok', 'folderINBOX', 'a', 'all',
    [{ id: 'folderINBOX', order: 1 }, { id: 'folderSent', order: 3 }], { searchFn });
  ok(r.searchedAll === false && r.messages.length === 1, 'aktif: hasil folder aktif saja, tanpa fan-out');
}

// ── searchAllFolders: folder gagal dianggap 0 hasil (bukan error global) ─────
{
  mockImpl = (token, folder) => {
    if (folder === 'folderINBOX') return { messages: [] };
    if (folder === 'folderErr') throw new Error('boom');
    return { messages: [] };
  };
  const r = await searchAllFolders('tok', 'folderINBOX', 'x', 'all', [
    { id: 'folderINBOX', order: 1 }, { id: 'folderErr', order: 2 }, { id: 'folderOk', order: 3 },
  ], { searchFn });
  ok(r.folderErrors === 1 && r.searchedAll === true, `gagal: folder error dihitung (dapat ${r.folderErrors})`);
}

// ── mergeSearchResults: dedupe + sort desc ───────────────────────────────────
{
  const merged = mergeSearchResults([
    { uid: 1, folderId: 'folderINBOX', date: '2026-09-01', subject: 'a' },
    { uid: 1, folderId: 'folderINBOX', date: '2026-09-01', subject: 'a' },
    { uid: 2, folderId: 'folderSent', date: '2026-09-10', subject: 'b' },
  ]);
  ok(merged.length === 2, `merge: dedupe (dapat ${merged.length})`);
  ok(merged[0].folderId === 'folderSent', 'merge: terbaru dulu');
}

// ── analyzeEmptyList ─────────────────────────────────────────────────────────
{
  const a = analyzeEmptyList({ searchQuery: 'x', activeFilters: { unread: true } });
  ok(a.kind === 'search', 'empty: search menang atas filter');
  const b = analyzeEmptyList({ searchQuery: '', activeFilters: { unread: true, attachment: false, flag: true } });
  ok(b.kind === 'filters' && b.filters.length === 2, 'empty: filter aktif terdeteksi');
  const c = analyzeEmptyList({ searchQuery: '', activeFilters: {} });
  ok(c.kind === 'folder', 'empty: tanpa query/filter → folder kosong');
  ok(FILTER_LABELS_ID.unread === 'belum dibaca', 'empty: label ID tersedia');
}

// ── konstanta ────────────────────────────────────────────────────────────────
ok(GLOBAL_SEARCH.MAX_FOLDERS >= 8, 'konst: batas folder masuk akal');

console.log(`test-mail-search: ${pass} assertion OK, ${fail} failed`);
process.exit(fail ? 1 : 0);
