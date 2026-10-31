import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
// Intent asli (fix "conversation preview"): baris preview percakapan harus
// pesan TERBARU hasil grouping — bukan tergantung urutan response SOGo.
// Fix 2026-09-22: memo conversationPreviewMessages yang lama dihapus; grup
// dirender UTUH dan preview = group.messages[0] (conversations.js menjamin
// urutan desc per grup). Intent yang sama, struktur lebih sederhana.
assert.match(source, /const conversationGroups = useMemo\(/,
  'conversation derives groups from normalized grouped data');
assert.match(source, /groupConversations\(filteredMessages,/,
  'conversation grouping follows all loaded filtered rows');
assert.match(source, /return conversationGroups;/,
  'visible projection renders the full groups (no per-group member truncation)');
assert.match(source, /renderMessageRow\(group\.messages\[0\], -1, true\)/,
  'preview row is the latest message of the group (messages sorted desc by lib)');
assert.match(source, /isExpanded && group\.messages\.slice\(1\)\.map/,
  'older thread members revealed only when expanded');
assert.doesNotMatch(source, /conversationPreviewMessages/,
  'obsolete preview-uid memo removed (was the member-truncation source)');
console.log('conversation-new-preview: 5 assertions PASS');
