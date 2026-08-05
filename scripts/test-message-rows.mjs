import assert from 'node:assert/strict';
import { parseMessageRows, parseMessageRow, SOGO_MESSAGE_HEADERS } from '../src/lib/messageRows.js';

const address = [{ name: 'Sender', email: 'sender@example.test' }];
const row = [address, 1, 0, 'Quarterly report', address, 1, 0, '2026-08-04', 123, '', 42, 0, 0];

const parsed = parseMessageRows({
  uids: [42, 41],
  headers: [SOGO_MESSAGE_HEADERS, row],
});
assert.deepEqual(parsed, [{
  uid: 42,
  from: 'Sender <sender@example.test>',
  to: 'Sender <sender@example.test>',
  subject: 'Quarterly report',
  date: '2026-08-04',
  isRead: true,
  hasAtt: true,
  isFlagged: false,
}]);

// Older responses may omit the column-name row; retain the established
// positional fallback rather than dropping all visible messages.
assert.equal(parseMessageRows({ headers: [row] })[0].uid, 42);

// A single data row with a subject equal to a known column name is not a header.
const subjectNamedSubject = [...row];
subjectNamedSubject[3] = 'Subject';
assert.equal(parseMessageRows({ headers: [subjectNamedSubject] })[0].subject, 'Subject');

// Reordered columns must still map correctly by their names.
const reorderedColumns = ['uid', 'Subject', 'From', 'To', 'isRead', 'RelativeDate'];
const reorderedRow = [99, 'Reordered', address, address, '0', 'yesterday'];
assert.deepEqual(parseMessageRow(reorderedRow, reorderedColumns), {
  uid: 99,
  from: 'Sender <sender@example.test>',
  to: 'Sender <sender@example.test>',
  subject: 'Reordered',
  date: 'yesterday',
  isRead: false,
  hasAtt: false,
  isFlagged: false,
});

// Missing optional columns must not borrow values from another reordered field.
assert.deepEqual(parseMessageRow(
  [100, 'Subject-only', { name: 'Single', email: 'single@example.test' }],
  ['uid', 'Subject', 'From'],
), {
  uid: 100,
  from: 'Single <single@example.test>',
  to: '',
  subject: 'Subject-only',
  date: '',
  isRead: false,
  hasAtt: false,
  isFlagged: false,
});

// A non-Inbox folder uses the same response parser and total metadata path.
const sent = parseMessageRows({
  uids: [7],
  headers: [['uid', 'Subject', 'From', 'To'], [7, 'Sent item', address, address]],
});
assert.equal(sent[0].uid, 7);
assert.equal(sent[0].subject, 'Sent item');

console.log('messageRows assertions passed');
