import assert from 'node:assert/strict';

// ── Mock sessionStorage (per-tab) — klaim auto-archive ──────────────────────
const session = new Map();
globalThis.sessionStorage = {
  getItem: (k) => session.get(k) ?? null,
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
};
// localStorage tetap dibutuhkan oleh autoArchive (getRules) — mock kosong.
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const { claimAutoArchiveUids, releaseAutoArchiveClaims } = await import('../src/lib/autoArchive.js');
const { loadSnoozes, snoozeMessage } = await import('../src/lib/snooze.js');

const EMAIL = 'u@example.com';

// ── Klaim pertama: semua uid fresh diklaim tab ini ──────────────────────────
const claimed1 = claimAutoArchiveUids(EMAIL, [101, 102, 103]);
assert.deepEqual(claimed1.sort((a, b) => a - b), ['101', '102', '103'], 'claim pertama ambil semua');

// Tab kedua (simulasi: klaim ulang sebelum TTL habis) — uid yang sama SKIP.
const claimed2 = claimAutoArchiveUids(EMAIL, [101, 102, 103, 104]);
assert.deepEqual(claimed2, ['104'], 'uid yang sudah diklaim tab lain di-skip; yang baru diklaim');

// Klaim scoped per email — akun lain tidak terpengaruh.
const other = claimAutoArchiveUids('other@example.com', [101]);
assert.deepEqual(other, ['101'], 'klaim per-akun terpisah');

// ── Release: uid dilepas → bisa diklaim lagi ────────────────────────────────
releaseAutoArchiveClaims(EMAIL, [101]);
const reclaim = claimAutoArchiveUids(EMAIL, [101]);
assert.deepEqual(reclaim, ['101'], 'setelah release, uid bisa diklaim lagi');

// ── TTL: klaim kedaluwarsa otomatis dibersihkan ─────────────────────────────
// Simulasi klaim lama: tulis sessionStorage langsung dengan timestamp lampau.
const claimsKey = `pcp_aa_claims_${EMAIL}`;
const raw = JSON.parse(sessionStorage.getItem(claimsKey));
raw['999'] = Date.now() - 10 * 60_000; // 10 menit lalu (> TTL 5 menit)
sessionStorage.setItem(claimsKey, JSON.stringify(raw));
const afterTtl = claimAutoArchiveUids(EMAIL, [999]);
assert.deepEqual(afterTtl, ['999'], 'klaim yang kedaluwarsa dibersihkan → bisa diklaim ulang');

// ── Input tidak valid aman ───────────────────────────────────────────────────
assert.deepEqual(claimAutoArchiveUids('', [1]), []);
assert.deepEqual(claimAutoArchiveUids(EMAIL, []), []);
assert.deepEqual(claimAutoArchiveUids(EMAIL, null), []);
releaseAutoArchiveClaims(EMAIL, []); // tidak throw
releaseAutoArchiveClaims('', [1]); // tidak throw

// ── Snooze storage: schema v3 + fungsi masih bekerja (regresi) ──────────────
snoozeMessage(EMAIL, 'folderINBOX', 42, Math.floor(Date.now() / 1000) + 3600);
const map = loadSnoozes(EMAIL);
assert.equal(map.folderINBOX['42'] > 0, true, 'snooze v3 tersimpan di folder scope');

console.log('multitab assertions passed');
