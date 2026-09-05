#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const groupingStart = src.indexOf('const conversationGroups = useMemo');
assert.ok(groupingStart >= 0, 'conversation grouping block exists');
assert.match(src, /groupConversations\(filteredMessages,/,
  'conversation grouping follows all loaded filtered rows');
assert.doesNotMatch(src, /groupConversations\((messages|sortedMessages|displayMessages),/,
  'conversation grouping does not bypass loaded filter source');
assert.match(src, /const visibleConversationGroups = useMemo/,
  'conversation derives visible groups separately');
assert.match(src, /group\.messages\[0\]/,
  'conversation always keeps latest message visible');
assert.match(src, /visibleConversationGroups\.filter\(\(group\) => group\.messages\.length > 1\)\.slice\(0, 50\)/,
  'expand-all excludes singleton groups and keeps the 50-thread safety limit');
assert.match(src, /Conversation dibentuk dari SEMUA pesan yang sudah dimuat/,
  'conversation grouping documents its loaded-message contract');
// Audit 2026-09-05: sumber filter = messagesInWindow (bukan `messages` mentah)
// agar pesan luar window 5-bulan INBOX tidak muncul lewat jalur conversation.
assert.match(src, /const filteredLoadedMessages = useMemo/,
  'filter+window applied in one memo (window applies to conversation source too)');
console.log('conversation-pagination: assertions PASS');
