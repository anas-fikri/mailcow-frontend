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
assert.match(src, /Conversation dibentuk dari semua pesan yang sudah dimuat/,
  'conversation grouping documents its loaded-message contract');
console.log('conversation-pagination: assertions PASS');
