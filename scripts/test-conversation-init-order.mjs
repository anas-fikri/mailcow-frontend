import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/MailPage.jsx', 'utf8');
const declaration = source.indexOf('const isSentOrDraft = isSentOrDraftFolder');
const preview = source.indexOf('const conversationPreviewMessages = useMemo');
const groups = source.indexOf('const conversationGroups = useMemo');
assert.ok(declaration >= 0, 'isSentOrDraft declaration exists');
assert.ok(preview >= 0 && groups >= 0, 'conversation memos exist');
assert.ok(declaration < preview, 'isSentOrDraft is declared before conversation preview');
assert.ok(declaration < groups, 'isSentOrDraft is declared before conversation groups');
assert.doesNotMatch(source.slice(preview, groups), /const isSentOrDraft =/,
  'conversation block has no duplicate late declaration');
console.log('conversation-init-order: 4 assertions PASS');
