#!/usr/bin/env node
/**
 * Regression: filter-before-pagination di MailPage + purge flag-color on move.
 *
 * Bug yang dikunci oleh test ini (audit /webmail/mail 2026-09-05):
 * 1. Filter flag/kategori/unread/lampiran hanya diterapkan ke visibleMessages
 *    (window paginasi 50) — header yang dimuat via infinite-scroll TIDAK
 *    lolos filter: filter "belum dibaca" tampil kosong padahal ada unread di
 *    luar 50 pertama; tab kategori "Promosi 12" tapi daftar hanya 4.
 * 2. Entri flag-color (localStorage per-uid) menjadi yatim setelah pesan
 *    dipindah/dihapus — uid SOGo per-folder dipakai ulang pesan baru →
 *    pesan baru membawa warna lama + memenuhi filter flag (false positive).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');

// ── 1. Filter diterapkan SEBELUM paginasi ────────────────────────────────────
assert.match(src, /const filteredLoadedMessages = useMemo\(\s*\(\) =>\s*messagesInWindow\.filter\(filterMessage\)/,
  'filter runs over messagesInWindow (all loaded headers), not the pagination window');
assert.match(src, /const displayMessages = filteredLoadedMessages\.slice\(0, visibleCount\)/,
  'displayMessages = filter → THEN slice (order fixed)');
assert.doesNotMatch(src, /= visibleMessages\.filter\(filterMessage\)/,
  'old buggy order (filter after pagination) must not return');// Flag filter count di sidebar harus dari sumber yang sama (bukan window) —
// sekarang lewat helper folder-scoped flagColorOf (flagColors v3).
assert.match(src, /const count = messagesInWindow\.filter\(\(m\) => flagColorOf\(m\.uid\) === key\)\.length;/,
  'flag filter counts use the same full-loaded source (folder-scoped helper)');
// Semua pembacaan/tulisan flag color di MailPage harus lewat konteks folder.
assert.doesNotMatch(src, /getFlagColor\(user\?\.email, [^,)]+\)\s*[!=]==?/, 
  'no folder-less flag color reads (uid is per-folder — always pass folderId)');
// Conversation juga harus dari sumber terfilter (bukan messages mentah).
assert.doesNotMatch(src, /=> messages\.filter\(filterMessage\)/,
  'conversation source must not bypass the 5-month window');

// ── 2. Purge flag-color di SETIAP jalur yang membatalkan uid ────────────────
for (const mut of ['moveMutation', 'quickMoveMutation', 'bulkDeleteMutation', 'junkMutation']) {
  const block = src.slice(src.indexOf(`const ${mut} = useMutation`));
  const nextMutation = block.slice(1).search(/const \w+ = useMutation/);
  const body = nextMutation === -1 ? block : block.slice(0, nextMutation);
  assert.ok(body.includes('removeFlagColorsBulk'),
    `${mut} must purge flag-color entries (uid becomes invalid after mutation)`);
}

console.log('mail-filter-pagination: all assertions PASS');
