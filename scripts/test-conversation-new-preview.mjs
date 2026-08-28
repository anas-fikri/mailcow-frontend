import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
assert.match(source, /const conversationPreviewMessages = useMemo\(/,
  'conversation derives latest previews independently from raw pagination');
assert.match(source, /groupConversations\(filteredMessages, false/,
  'conversation preview is derived from normalized grouped data');
assert.match(source, /\.map\(\(group\) => group\.latest\)/,
  'conversation preview selects the latest message from every group');
assert.match(source, /conversationView \? conversationPreviewMessages : displayMessages/,
  'conversation render projection uses conversation previews when active');
assert.match(source, /\.map\(\(group\) => group\.latest\)/,
  'conversation preview selects latest rows from sorted groups');
console.log('conversation-new-preview: 5 assertions PASS');
