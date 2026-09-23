#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
// Audit 2026-09-05: filter diterapkan pada messagesInWindow SEBELUM paginasi
// (filteredLoadedMessages → slice) — sebelumnya filter hanya menjangkau
// visibleMessages (window paginasi) sehingga header hasil infinite-scroll
// tidak pernah lolos filter flag/kategori/unread/lampiran.
assert.match(src, /const filteredLoadedMessages = useMemo\(/,
  'filter applies to ALL loaded messages, not only the pagination window');
assert.match(src, /filteredLoadedMessages\.slice\(0, visibleCount\)/,
  'pagination slices the FILTERED list (filter before pagination)');
assert.match(src, /groupConversations\(filteredMessages,/,
  'conversation groups all loaded filtered messages');

// Fix 2026-09-22 (tertangkap E2E live): grup percakapan dirender UTUH —
// preview = group.messages[0] (pesan terbaru), anggota lama tampil saat
// expand. Versi lama memotong anggota grup ke uid preview saja → tiap grup
// selalu berisi 1 pesan: header thread, expand, dan chip agregat tidak pernah
// tampil. Paginasi tetap berlaku lewat SUMBER (filteredMessages = window
// 5-bulan INBOX + header hasil scroll), bukan pemotongan anggota per-grup.
assert.doesNotMatch(src, /visibleConversationUids/,
  'group membership is NOT truncated to preview uids (fix 2026-09-22)');
assert.match(src, /const visibleConversationGroups = useMemo\(/,
  'conversation renders the visible group projection');
assert.doesNotMatch(src, /messages: group\.messages\.filter\(\(message\) => visibleConversationUids\.has/,
  'obsolete member-truncation must stay removed');
console.log('conversation-visible-filter: assertions PASS');
