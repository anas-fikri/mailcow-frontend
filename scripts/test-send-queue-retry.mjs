import assert from 'node:assert/strict';
import {
  createSendQueue, buildQueueEntry, nextRetryAt, RETRY_DELAYS_MS, MAX_ATTEMPTS,
  failedForUser, pendingForUser, isQueueOwner, SEND_QUEUE_STATUS,
} from '../src/lib/sendQueue.js';

const memQueue = () => {
  const writes = [];
  const q = createSendQueue({ filePath: '/x', readFile: () => null, writeFile: (_p, d) => { writes.push(d); }, onSaveError: () => {} });
  return { q, writes };
};
const entry = (over = {}) => buildQueueEntry({ user: 'User@Example.com', sendAt: 1000, payload: { to: 'a@b.c', subject: 'Hi' }, cred: { v: 1 }, ...over });

// ── Backoff: 1 mnt, 5 mnt, 30 mnt, lalu menyerah ─────────────────────────────
assert.equal(MAX_ATTEMPTS, RETRY_DELAYS_MS.length + 1);
assert.equal(nextRetryAt(1, 0), 60_000);
assert.equal(nextRetryAt(2, 0), 300_000);
assert.equal(nextRetryAt(3, 0), 1_800_000);
assert.equal(nextRetryAt(4, 0), null, 'percobaan ke-4 gagal → tidak ada retry lagi');

// ── touchAttempt menunda sendAt; markFailed mencatat failedAt ────────────────
{
  const { q } = memQueue();
  const e = entry();
  q.add(e);
  q.touchAttempt(e.id, 1, 99_000);
  assert.equal(q.find(e.id).sendAt, 99_000);
  assert.equal(q.find(e.id).attempts, 1);
  q.markFailed(e.id, 'boom');
  assert.equal(q.find(e.id).status, SEND_QUEUE_STATUS.FAILED);
  assert.ok(q.find(e.id).failedAt > 0);
}

// ── pruneStale memakai failedAt, bukan createdAt ─────────────────────────────
{
  const { q } = memQueue();
  const old = entry({ id: 'old' });
  old.createdAt = Date.now() - 3 * 24 * 3600_000; // dibuat 3 hari lalu
  q.add(old);
  q.markFailed('old', 'x'); // gagal barusan
  q.pruneStale(24 * 3600_000);
  assert.ok(q.find('old'), 'gagal baru-baru ini tetap disimpan walau dibuat lama');
}

// ── recredential: hanya entri PENDING milik user (case-insensitive) ─────────
{
  const { q } = memQueue();
  q.add(entry({ id: 'a' }));
  q.add(entry({ id: 'b', user: 'other@example.com' }));
  q.add(entry({ id: 'c' }));
  q.markFailed('c', 'x');
  assert.equal(q.recredential('user@example.com', { v: 1, data: 'new' }), 1);
  assert.equal(q.find('a').cred.data, 'new');
  assert.notEqual(q.find('b').cred.data, 'new');
  assert.notEqual(q.find('c').cred.data, 'new');
}

// ── Kepemilikan & daftar tidak peka huruf besar/kecil ────────────────────────
assert.ok(isQueueOwner(entry(), 'user@example.com'));
assert.ok(!isQueueOwner(null, 'user@example.com'));
{
  const list = [entry({ id: 'p' }), { ...entry({ id: 'f' }), status: SEND_QUEUE_STATUS.FAILED, failedAt: 5 }];
  assert.deepEqual(pendingForUser(list, 'USER@example.com').map((x) => x.id), ['p']);
  assert.deepEqual(failedForUser(list, 'user@EXAMPLE.com').map((x) => x.id), ['f']);
}

// ── Serialisasi gagal TIDAK melempar ke pemanggil ───────────────────────────
{
  const errors = [];
  const q = createSendQueue({ filePath: '/x', readFile: () => null, writeFile: () => {}, onSaveError: (e) => errors.push(e) });
  const cyclic = entry({ id: 'cyc' });
  cyclic.payload.self = cyclic; // JSON.stringify melempar TypeError
  assert.doesNotThrow(() => q.add(cyclic));
  assert.equal(errors.length, 1, 'error dilaporkan lewat onSaveError');
  assert.ok(q.find('cyc'), 'entri tetap di memori');
}

console.log('✅ test-send-queue-retry: semua lolos');
