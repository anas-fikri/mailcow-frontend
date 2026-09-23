import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
assert.match(source, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,auto\)\]/,
  'mailbox header reserves a separate counter column');
assert.match(source, /data-mailbox-toolbar="actions"/,
  'mailbox actions have a dedicated layout container');
assert.match(source, /col-span-2 flex items-center gap-1 min-w-0 max-w-full overflow-x-auto/,
  'mailbox action icons scroll in their own non-overlapping row');
assert.match(source, /groupConversations\(filteredMessages, sortAsc/,
  'conversation groups are based on all loaded filtered messages');
assert.match(source, /const visibleConversationGroups = useMemo\(\(\) => \{\n    if \(!conversationView\) return \[\];\n    return conversationGroups;/s,
  'visible projection renders full groups (preview = group.messages[0] via renderMessageRow)');
assert.match(source, /expandableConversationGroups\.map\(\(g\) => g\.key\)/,
  'expand-all only targets visible expandable threads');
assert.match(source, /\{visibleConversationGroups\.length\} percakapan/,
  'active conversation mode exposes a visible conversation count');

console.log('conversation-toolbar-regression: 7 assertions PASS');
