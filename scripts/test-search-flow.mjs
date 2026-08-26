import assert from 'node:assert/strict';
import fs from 'node:fs';

// ── Assertion statis alur SEARCH (pola test-a11y / test-draft-compose) ───────
// Memverifikasi 4 perbaikan interaksi search di MailPage + helper window.
const mail = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const lib = fs.readFileSync('src/lib/dateGroups.js', 'utf8');

let passCount = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passCount++; };

// ── Bug 1: search harus menembus window 5 bulan Kotak Masuk ──────────────────
// Sebelumnya messagesInWindow memotong hasil pencarian di INBOX juga → email
// lama tetap tidak bisa dicari padahal UI menjanjikan sebaliknya.
ok(mail.includes("if (searchQuery || selectedFolder !== 'folderINBOX') return messages;"),
  'window 5 bulan harus di-skip saat searchQuery aktif');
ok(mail.includes('applyMessageWindow(messages, { months: MESSAGE_WINDOW_MONTHS })'),
  'window memakai helper murni applyMessageWindow');
ok(lib.includes('export function applyMessageWindow'), 'applyMessageWindow harus diekspor dari dateGroups');
ok(mail.includes('applyMessageWindow') && mail.includes('from \'../lib/dateGroups\''),
  'MailPage harus import applyMessageWindow');

// ── Bug 2: auto-archive rules TIDAK boleh jalan saat mode search ─────────────
// Rules memindahkan pesan; memindahkan hasil pencarian mengejutkan user.
ok(mail.includes('if (searchQuery) return;\n    if (!user?.email || !user?.sogoToken || !messages.length || !enabledRules) return;'),
  'executeRules effect harus di-skip saat searchQuery');
ok(mail.includes('snoozedUids, searchQuery]'), 'searchQuery harus masuk deps effect rules');

// ── Bug 3: pesan di-snooze TETAP muncul di hasil search ──────────────────────
// Di-snooze = tersembunyi dari daftar biasa; search adalah satu-satunya jalan
// menemukannya sampai waktu wake (pola Gmail).
ok(mail.includes('if (!searchQuery && snoozedUids.has(String(m.uid))) return false;'),
  'filter snooze harus di-skip saat searchQuery');

// ── Bug 4: filter kategori di-reset saat mulai search ────────────────────────
// Tab kategori disembunyikan saat search → filter tersisa menyaring hasil
// secara tak terlihat tanpa cara membersihkannya.
ok(mail.includes('setCategoryFilter(null);\n    setSearchQuery(searchInput.trim());'),
  'handleSearchSubmit harus reset categoryFilter');
ok(mail.includes('setCategoryFilter(null); // sama seperti handleSearchSubmit'),
  'searchBySender harus reset categoryFilter');

console.log('\nSearch flow audit: ' + passCount + ' assertions PASS ✅');
