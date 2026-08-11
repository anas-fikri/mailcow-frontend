import assert from 'node:assert/strict';
import { getInitials } from '../src/lib/initials.js';
import { isSentOrDraftFolder } from '../src/lib/constants.js';

// ─── getInitials ──────────────────────────────────────────────────────────────

const initialsCases = [
  ['John Doe <john@x.com>', 'JD'],
  ['"Jane Smith" <jane@x.com>', 'JS'],
  ['john.doe@x.com', 'JD'],
  ['john@x.com', 'J'],
  ['', '?'],
  ['  ', '?'],
  ['(Tanpa Penerima)', '?'],
  ['Unknown Sender', 'US'],
  ['buddy@x.com', 'B'],
  ['A <a@x.com>, B <b@y.com>', 'A'],
  ['Sales Team <sales@x.com>', 'ST'],
  [null, '?'],
  ['  john  doe  <j@x.com> ', 'JD'],
];

for (const [input, expected] of initialsCases) {
  assert.equal(getInitials(input), expected, `getInitials(${JSON.stringify(input)})`);
}

// ─── isSentOrDraftFolder ──────────────────────────────────────────────────────

const folderCases = [
  [['folderSent'], true],
  [['folderDrafts'], true],
  [['folderINBOX'], false],
  [['folderTrash'], false],
  [['folderJunk'], false],
  [['customProjects', [{ id: 'customProjects', type: 'sent' }]], true],
  [['customProjects', [{ id: 'customProjects', type: 'draft' }]], true],
  [['customProjects', [{ id: 'customProjects', type: 'inbox' }]], false],
  [['customProjects', [{ id: 'customProjects', type: 'archive' }]], false],
  [['missing', []], false],
];

for (const [args, expected] of folderCases) {
  const [folderId, folders] = args;
  assert.equal(
    isSentOrDraftFolder(folderId, folders),
    expected,
    `isSentOrDraftFolder(${JSON.stringify(folderId)}, ${JSON.stringify(folders || undefined)})`
  );
}

console.log(`initials assertions passed (${initialsCases.length} getInitials + ${folderCases.length} isSentOrDraftFolder)`);
