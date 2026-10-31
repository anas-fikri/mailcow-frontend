import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
assert.match(source, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,auto\)\]/,
  'mailbox header reserves a separate counter column');
assert.match(source, /data-mailbox-toolbar="actions"/,
  'mailbox actions have a dedicated layout container');
// 2026-10 (header ringkas ala Outlook): toolbar berbagi baris dgn judul,
// TIDAK pernah wrap/scroll — ikon yang tidak muat pindah ke menu "Lainnya".
assert.match(source, /flex flex-nowrap items-center justify-end gap-0\.5 min-w-0 overflow-hidden"\n\s*data-mailbox-toolbar="actions"/,
  'mailbox action icons stay in one non-wrapping, non-overlapping row');
assert.match(source, /planToolbar\(listHeaderW,/,
  'toolbar overflow decided from measured header width');
assert.match(source, /toolbarPlan\.overflow\.forEach/,
  'icons that do not fit stay reachable via the overflow menu');
assert.match(source, /groupConversations\(filteredMessages, sortAsc/,
  'conversation groups are based on all loaded filtered messages');
assert.match(source, /const visibleConversationGroups = useMemo\(\(\) => \{\n    if \(!conversationView\) return \[\];\n    return conversationGroups;/s,
  'visible projection renders full groups (preview = group.messages[0] via renderMessageRow)');
assert.match(source, /expandableConversationGroups\.map\(\(g\) => g\.key\)/,
  'expand-all only targets visible expandable threads');
assert.match(source, /\{visibleConversationGroups\.length\} percakapan · \{expandableConversationGroups\.length\} thread/,
  'active conversation mode exposes a visible conversation count (compact meta line)');

console.log('conversation-toolbar-regression: 9 assertions PASS');
