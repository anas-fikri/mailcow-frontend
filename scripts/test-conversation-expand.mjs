#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
assert.match(src, /expandableConversationGroups\s*=\s*useMemo/,
  'expandable groups are derived separately');
assert.match(src, /filter\(\(group\) => group\.messages\.length > 1\)\.slice\(0, 50\)/,
  'expand-all excludes singleton conversations and caps at 50');
assert.match(src, /expandableConversationGroups\.every\(\(group\) => expandedConversations\.has\(group\.key\)\)/,
  'all-open state checks every expandable thread key');
// Perluas/Ciutkan semua kini item menu "Lainnya" (header ringkas).
assert.match(src, /onSelect: allExpandableConversationsOpen \? collapseAllConversations : expandAllConversations/,
  'toggle uses actual expandable state');
assert.match(src, /group\.messages\[0\]/,
  'latest message preview remains visible when collapsed');
assert.match(src, /group\.messages\.slice\(1\)\.map/,
  'older messages are revealed only when expanded');
assert.match(src, /label: allExpandableConversationsOpen \? 'Ciutkan semua' : 'Perluas semua'/,
  'toggle label reflects actual state');
console.log('conversation-expand: assertions PASS');
