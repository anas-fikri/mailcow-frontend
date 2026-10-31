import assert from 'node:assert/strict';
import { parseBatch, createMetricsStore, BUCKETS, MAX_BATCH } from '../src/lib/metricsStore.js';

// ── parseBatch: hanya nama daftar putih + angka wajar ─────────────────────────
assert.deepEqual(parseBatch(null), []);
assert.deepEqual(parseBatch({ m: 'x' }), []);
assert.deepEqual(
  parseBatch({ d: 'mobile', m: [['message_open', 420], ['evil_name', 1], ['send', -5], ['send', NaN], ['search', 999999], ['search', '12']] }),
  [{ name: 'message_open', value: 420, device: 'mobile' }],
  'nama asing, negatif, NaN, terlalu besar, dan string ditolak',
);
assert.equal(parseBatch({ d: 'tablet', m: [['send', 10]] })[0].device, 'desktop', 'device asing → desktop');
assert.equal(parseBatch({ m: [['__proto__', 1], ['constructor', 1], ['toString', 1]] }).length, 0, 'nama prototype ditolak');
const big = { m: Array.from({ length: MAX_BATCH + 20 }, () => ['send', 100]) };
assert.equal(parseBatch(big).length, MAX_BATCH, 'batch dipotong ke MAX_BATCH');

// ── Histogram kumulatif + persentil ───────────────────────────────────────────
const store = createMetricsStore();
for (const v of [80, 150, 250, 400, 900, 1200, 2500, 4000, 40, 60]) store.record({ name: 'message_open', value: v, device: 'desktop' });
assert.equal(store.percentile('message_open', 'desktop', 50), 300, 'p50 ≈ bucket 300 ms');
assert.equal(store.percentile('message_open', 'desktop', 95), 5000, 'p95 ≈ bucket 5000 ms');
assert.equal(store.percentile('message_open', 'mobile', 50), null, 'seri kosong → null');

const text = store.toPrometheus();
assert.match(text, /# TYPE webmail_ux_message_open_ms histogram/);
assert.match(text, /webmail_ux_message_open_ms_bucket\{device="desktop",le="100"\} 3/, 'bucket kumulatif ≤100 ms = 3');
assert.match(text, /webmail_ux_message_open_ms_bucket\{device="desktop",le="\+Inf"\} 10/);
assert.match(text, /webmail_ux_message_open_ms_count\{device="desktop"\} 10/);
assert.match(text, /webmail_ux_message_open_ms_sum\{device="desktop"\} 9580/);
const bucketLines = text.split('\n').filter((l) => l.includes('_bucket{'));
assert.equal(bucketLines.length, BUCKETS.length + 1, 'satu baris per bucket + +Inf');

console.log('✅ test-metrics-store: semua lolos');
