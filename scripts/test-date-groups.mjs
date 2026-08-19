import assert from 'node:assert/strict';
import { parseMessageDate, getDateGroup, groupMessagesByDate, DATE_GROUPS } from '../src/lib/dateGroups.js';

const now = new Date('2026-08-19T12:00:00');

// parseMessageDate — tolerant, never throws
assert.ok(parseMessageDate('2026-08-19T10:00:00Z') instanceof Date);
assert.ok(parseMessageDate('1690000000') instanceof Date); // epoch seconds
assert.equal(parseMessageDate(null), null);
assert.equal(parseMessageDate(undefined), null);
assert.equal(parseMessageDate(''), null);
assert.equal(parseMessageDate('garbage'), null);

// today / yesterday literals
assert.equal(getDateGroup('today', now).key, 'today');
assert.equal(getDateGroup('yesterday', now).key, 'yesterday');
assert.equal(getDateGroup('kemarin', now).key, 'yesterday');

// Epoch offsets → groups
const oneHourAgo = Math.floor(now.getTime() / 1000 - 3600);
const threeDaysAgo = Math.floor(now.getTime() / 1000 - 3 * 86400);
const tenDaysAgo = Math.floor(now.getTime() / 1000 - 10 * 86400);
const fortyDaysAgo = Math.floor(now.getTime() / 1000 - 40 * 86400);

assert.equal(getDateGroup(oneHourAgo, now).key, 'today');
assert.equal(getDateGroup(threeDaysAgo, now).key, 'thisWeek');
assert.equal(getDateGroup(tenDaysAgo, now).key, 'thisMonth');
assert.equal(getDateGroup(fortyDaysAgo, now).key, 'older');

// Unparseable → older bucket
assert.equal(getDateGroup('not-a-date', now).key, 'older');

// groupMessagesByDate preserves contiguous groups & order
const msgs = [
  { id: 1, date: oneHourAgo },
  { id: 2, date: oneHourAgo },
  { id: 3, date: fortyDaysAgo },
  { id: 4, date: fortyDaysAgo },
];
const groups = groupMessagesByDate(msgs, (m) => m.date, now);
assert.equal(groups.length, 2);
assert.equal(groups[0].key, 'today');
assert.equal(groups[0].messages.length, 2);
assert.equal(groups[1].key, 'older');
assert.equal(groups[1].messages.length, 2);

// DATE_GROUPS sanity
assert.ok(DATE_GROUPS.length >= 4);

console.log('dateGroups assertions passed');
