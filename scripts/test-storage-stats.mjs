// ── Unit test: src/lib/storageStats.js (kartu Penyimpanan, empty state) ──────
// Jalankan: node scripts/test-storage-stats.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasStorageData } from '../src/lib/storageStats.js';

// Data tidak tersedia → empty state (bukan "0% · 0 Mailboxes · 0 Domain")
assert.equal(hasStorageData(null), false);
assert.equal(hasStorageData(undefined), false);
assert.equal(hasStorageData({}), false);
assert.equal(hasStorageData({ used: 0, total: 0, mailboxes: 0, domains: 0 }), false, 'MOCK_STORAGE semua nol = tidak tersedia');
assert.equal(hasStorageData({ used: NaN, total: 100 }), false, 'pemakaian tak terbaca');
assert.equal(hasStorageData({ used: '5', total: '10' }), false, 'string bukan angka');
assert.equal(hasStorageData({ used: -1, total: 10 }), false, 'negatif ditolak');

// Data nyata
assert.equal(hasStorageData({ used: 0, total: 1024 }), true, 'kuota ada, pemakaian 0 = data valid');
assert.equal(hasStorageData({ used: 512, total: 1024, mailboxes: 0, domains: 0 }), true);
assert.equal(hasStorageData({ used: 0, total: 0, mailboxes: 12, domains: 0 }), true, 'hitungan mailbox saja');
assert.equal(hasStorageData({ domains: 2 }), true);

// Wiring: StatsPage memakai helper + menampilkan empty state berbahasa Indonesia.
const page = fs.readFileSync(new URL('../src/pages/StatsPage.jsx', import.meta.url), 'utf8');
assert.ok(page.includes('hasStorageData(storage)'), 'StatsPage harus memakai hasStorageData');
assert.ok(page.includes('Data penyimpanan tidak tersedia'), 'StatsPage: empty state penyimpanan hilang');

console.log('storageStats assertions passed');
