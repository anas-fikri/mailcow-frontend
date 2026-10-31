import assert from 'node:assert/strict';
import { getMessageTotal } from '../src/lib/messageTotals.js';

assert.equal(getMessageTotal({ uids: [1, 2, 3], headers: [[], [1]] }, 1), 3);
assert.equal(getMessageTotal({ total: 42, headers: [[], [1]] }, 1), 42);
assert.equal(getMessageTotal({ totalCount: '7' }, 1), 7);
assert.equal(getMessageTotal({ total: null, totalCount: undefined }, 4), 4);
assert.equal(getMessageTotal({ count: 5 }, 1), 5);
assert.equal(getMessageTotal({ headers: [[], [1], [2]] }, 2), 2);
assert.equal(getMessageTotal({ uids: [] }, 10), 0);

console.log('messageTotals assertions passed');
