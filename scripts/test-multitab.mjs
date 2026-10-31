import assert from 'node:assert/strict';

// ── Mock storage ──────────────────────────────────────────────────────────────
// localStorage DI-SHARE antar tab (per origin, bukan per tab) — ini kunci
// koordinasi cross-tab. sessionStorage TIDAK dipakai lagi untuk klaim
// (per-tab → klaim tab A tak terlihat tab B → double-move).
const shared = new Map();
globalThis.localStorage = {
  getItem: (k) => shared.get(k) ?? null,
  setItem: (k, v) => shared.set(k, String(v)),
  removeItem: (k) => shared.delete(k),
};

// Dua INSTANCE modul berbeda = dua TAB berbeda (masing-masing punya
// claimOwnerId sendiri). Import dengan cache-buster agar ESM membuat
// instance terpisah — persis seperti dua tab browser.
const { claimAutoArchiveUids: claimA, releaseAutoArchiveClaims: releaseA, autoArchiveClaimsKey } =
  await import('../src/lib/autoArchive.js?tab=A');
const { claimAutoArchiveUids: claimB, releaseAutoArchiveClaims: releaseB } =
  await import('../src/lib/autoArchive.js?tab=B');
const { loadSnoozes, snoozeMessage } = await import('../src/lib/snooze.js');

const EMAIL = 'u@example.com';

// ── Tab A klaim pertama: semua uid fresh diklaim tab A ──────────────────────
const claimedA1 = claimA(EMAIL, [101, 102, 103]);
assert.deepEqual(claimedA1.sort((a, b) => a - b), ['101', '102', '103'], 'tab A claim semua uid');

// ── Tab B claim uid yang sama (klaim A masih valid) → SKIP ──────────────────
const claimedB1 = claimB(EMAIL, [101, 102, 103, 104]);
assert.deepEqual(claimedB1, ['104'], 'tab B SKIP uid yang sudah diklaim tab A; hanya claim 104');

// ── Klaim ada di localStorage (bukan sessionStorage) ────────────────────────
assert.ok(
  shared.has(autoArchiveClaimsKey(EMAIL)),
  'klaim harus disimpan di localStorage (di-share antar tab)'
);

// ── Release ownership: tab B TIDAK boleh melepas klaim tab A ────────────────
releaseB(EMAIL, ['101', '102']);
// Klaim A utk 101/102 harus tetap ada → tab B masih skip utk uid itu.
const claimedB2 = claimB(EMAIL, [101, 102, 104]);
assert.deepEqual(claimedB2, [], 'release tab B tidak boleh menghapus klaim tab A (ownership)');

// ── Release own: tab A melepas klaimnya → bisa diklaim lagi ─────────────────
releaseA(EMAIL, ['101']);
const claimedA2 = claimA(EMAIL, [101]);
assert.deepEqual(claimedA2, ['101'], 'setelah release own, uid bisa diklaim lagi tab A');

// ── Release B melepas miliknya sendiri (104) ────────────────────────────────
releaseB(EMAIL, ['104']);
const claimedA3 = claimA(EMAIL, [104]);
assert.deepEqual(claimedA3, ['104'], 'tab A bisa claim uid yang dilepas tab B (milik B)');

// ── Klaim scoped per email — akun lain tidak terpengaruh ────────────────────
const other = claimA('other@example.com', [101]);
assert.deepEqual(other, ['101'], 'klaim per-akun terpisah');

// ── TTL: klaim kedaluwarsa otomatis dibersihkan ─────────────────────────────
// Tulis klaim lama langsung ke localStorage (record bentuk { owner, ts }).
const claimsKey = autoArchiveClaimsKey(EMAIL);
const raw = JSON.parse(shared.get(claimsKey));
raw['999'] = { owner: 'tab_lama', ts: Date.now() - 10 * 60_000 }; // 10 mnt lalu (> TTL 5 mnt)
shared.set(claimsKey, JSON.stringify(raw));
const afterTtl = claimA(EMAIL, [999]);
assert.deepEqual(afterTtl, ['999'], 'klaim kedaluwarsa dibersihkan → bisa diklaim ulang');

// ── Toleran bentuk legacy angka polos (record lama) ─────────────────────────
raw['888'] = Date.now() - 60_000; // bentuk angka polos, masih valid (1 mnt lalu)
shared.set(claimsKey, JSON.stringify(raw));
const legacySkip = claimB(EMAIL, [888]);
assert.deepEqual(legacySkip, [], 'record bentuk angka polos tetap dihormati sebagai klaim valid');

// ── Input tidak valid aman ───────────────────────────────────────────────────
assert.deepEqual(claimA('', [1]), []);
assert.deepEqual(claimA(EMAIL, []), []);
assert.deepEqual(claimA(EMAIL, null), []);
releaseA(EMAIL, []); // tidak throw
releaseA('', [1]); // tidak throw

// ── Snooze storage: schema v3 + fungsi masih bekerja (regresi) ──────────────
snoozeMessage(EMAIL, 'folderINBOX', 42, Math.floor(Date.now() / 1000) + 3600);
const map = loadSnoozes(EMAIL);
assert.equal(map.folderINBOX['42'] > 0, true, 'snooze v3 tersimpan di folder scope');

console.log('multitab assertions passed');
