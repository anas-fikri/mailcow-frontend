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
assert.match(src, /const visibleConversationUids = useMemo\(/,
  'conversation tracks the currently rendered message UIDs');
assert.match(src, /messages: group\.messages\.filter\(\(message\) => visibleConversationUids\.has\(String\(message\.uid\)\)\)/,
  'conversation groups only render messages visible after pagination');
assert.match(src, /visibleConversationGroups\.map\(\(group\) =>/,
  'conversation renders the visible group projection');
console.log('conversation-visible-filter: 5 assertions PASS');
