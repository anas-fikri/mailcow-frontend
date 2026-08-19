import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const {
  SNOOZE_PRESETS, loadSnoozes, snoozeMessage, unsnoozeMessage, isSnoozed, pruneExpired,
} = await import('../src/lib/snooze.js');

const now = Math.floor(Date.now() / 1000);

// Nothing snoozed initially
assert.equal(loadSnoozes('u@example.com')['42'], undefined);
assert.equal(isSnoozed('u@example.com', '42', now), false);

// Snooze (email normalized, uid stored as string)
snoozeMessage(' U@Example.COM ', 42, now + 3600);
assert.equal(isSnoozed('u@example.com', 42, now), true);
assert.equal(isSnoozed('u@example.com', 43, now), false);

// Unsnooze
unsnoozeMessage('u@example.com', 42);
assert.equal(isSnoozed('u@example.com', 42, now), false);

// pruneExpired removes past wake times, keeps future
snoozeMessage('u@example.com', 1, now - 10); // expired
snoozeMessage('u@example.com', 2, now + 10); // future
assert.equal(pruneExpired('u@example.com', now), 1); // only uid 2 remains
assert.equal(isSnoozed('u@example.com', 1, now), false);
assert.equal(isSnoozed('u@example.com', 2, now), true);

// Presets sanity
assert.equal(SNOOZE_PRESETS.length, 4);
assert.ok(SNOOZE_PRESETS.every((p) => p.hours > 0));

console.log('snooze assertions passed');
