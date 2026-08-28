#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
assert.match(src, /const filteredMessages = useMemo\(/,
  'conversation has a full loaded-message filter source');
assert.match(src, /groupConversations\(filteredMessages,/,
  'conversation groups all loaded filtered messages');
assert.match(src, /const visibleConversationUids = useMemo\(/,
  'conversation tracks the currently rendered message UIDs');
assert.match(src, /messages: group\.messages\.filter\(\(message\) => visibleConversationUids\.has\(String\(message\.uid\)\)\)/,
  'conversation groups only render messages visible after pagination');
assert.match(src, /visibleConversationGroups\.map\(\(group\) =>/,
  'conversation renders the visible group projection');
console.log('conversation-visible-filter: 5 assertions PASS');
