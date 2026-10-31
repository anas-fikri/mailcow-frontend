import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const declaration = source.indexOf('const isSentOrDraft = isSentOrDraftFolder');
const groups = source.indexOf('const conversationGroups = useMemo');
const visible = source.indexOf('const visibleConversationGroups = useMemo');
assert.ok(declaration >= 0, 'isSentOrDraft declaration exists');
assert.ok(groups >= 0 && visible >= 0, 'conversation memos exist');
assert.ok(declaration < groups, 'isSentOrDraft is declared before conversation groups');
assert.ok(declaration < visible, 'isSentOrDraft is declared before visible conversation groups');
const occurrences = source.split('const isSentOrDraft =').length - 1;
assert.equal(occurrences, 1, 'exactly one isSentOrDraft declaration (no duplicate late declaration in conversation block)');
console.log('conversation-init-order: 4 assertions PASS');
