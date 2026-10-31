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
// 2026-10-29: batas 5 bulan DIHAPUS seluruhnya (infinite scroll sampai habis)
// — daftar maupun pencarian tidak lagi dipotong tanggal.
ok(mail.includes('const messagesInWindow = messages;'),
  'daftar Kotak Masuk tidak lagi dipotong window 5 bulan');
ok(!mail.includes('applyMessageWindow(messages'), 'window tidak diterapkan ke daftar');
ok(!/stopFetchingRef\.current = true;\s*\n\s*}\s*\n\s*\/\/ UID habis/.test(mail) && !mail.includes('cutoff.setMonth(cutoff.getMonth() - MESSAGE_WINDOW_MONTHS)'),
  'loadMore tidak berhenti di batas 5 bulan');
ok(lib.includes('export function applyMessageWindow'), 'applyMessageWindow tetap diekspor dari dateGroups (dipakai test golden)');

// ── Bug 2: auto-archive rules TIDAK boleh jalan saat mode search ─────────────
// Rules memindahkan pesan; memindahkan hasil pencarian mengejutkan user.
ok(mail.includes('if (searchQuery) return;\n    if (!user?.email || !user?.sogoToken || !messages.length || !enabledRules) return;'),
  'executeRules effect harus di-skip saat searchQuery');
ok(mail.includes('snoozedUids, searchQuery, claimsTick]'), 'searchQuery + claimsTick harus masuk deps effect rules');

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
