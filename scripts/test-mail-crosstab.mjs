import assert from 'node:assert/strict';

// ── Verifikasi: mutasi mailbox di api.js men-bump versi crossTab 'mail' ──────
// Menjamin multi-tab sync: tab lain yang memasang watchDomainVersion('mail')
// menerima storage event → invalidate → refetch daftar/badge.
// Layer jaringan di-mock; fokus di EFEK SAMPING bump versi (localStorage).

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const listeners = new Map();
globalThis.window = {
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener: (type, fn) => { listeners.get(type)?.delete(fn); },
};
function fireStorage(key) {
  const ev = { key };
  (listeners.get('storage') || []).forEach((fn) => fn(ev));
}

let failStatus = 0;
globalThis.fetch = async () => ({
  status: failStatus || 204,
  ok: !failStatus,
  headers: { get: () => 'application/json' },
  json: async () => ({}),
  text: async () => '',
});

const { deleteMessages, moveMessages, markRead, markFlagged } = await import('../src/lib/api.js');
const { readDomainVersion, watchDomainVersion } = await import('../src/lib/crossTab.js');

const TOKEN = 'user@example.test';
const keyFor = `pcp_mail_v_${TOKEN}`;

const v0 = readDomainVersion('mail', TOKEN);
assert.equal(v0, 0, 'versi mail awal 0');

// ── deleteMessages → bump ────────────────────────────────────────────────────
await deleteMessages(TOKEN, 'folderINBOX', [42]);
const v1 = readDomainVersion('mail', TOKEN);
assert.ok(v1 > v0, 'deleteMessages harus men-bump versi mail');

// ── markRead + markFlagged → bump lagi (monotonik) ──────────────────────────
await markRead(TOKEN, 'folderINBOX', 42, true);
const v2 = readDomainVersion('mail', TOKEN);
assert.ok(v2 > v1, 'markRead harus men-bump versi mail');
await markFlagged(TOKEN, 'folderINBOX', 42, true);
const v3 = readDomainVersion('mail', TOKEN);
assert.ok(v3 > v2, 'markFlagged harus men-bump versi mail');

// ── moveMessages → bump ──────────────────────────────────────────────────────
await moveMessages(TOKEN, 'folderINBOX', [42], 'folderArchive');
const v4 = readDomainVersion('mail', TOKEN);
assert.ok(v4 > v3, 'moveMessages harus men-bump versi mail');

// ── Scope akun: token lain tidak terpengaruh ────────────────────────────────
assert.equal(readDomainVersion('mail', 'other@example.test'), 0, 'akun lain tidak terpengaruh');

// ── Watcher tab lain: storage event versi mail → invalidate callback ────────
let invalidated = 0;
const cleanup = watchDomainVersion('mail', TOKEN, () => { invalidated += 1; });
await markRead(TOKEN, 'folderINBOX', 41, true);
fireStorage(keyFor);
assert.ok(invalidated >= 1, 'watcher domain mail harus terpicu setelah mutasi');
cleanup();

// ── Mutasi GAGAL (HTTP 500) TIDAK boleh men-bump (versi = sinyal sukses) ────
failStatus = 500;
const vBeforeFail = readDomainVersion('mail', TOKEN);
await assert.rejects(() => markRead(TOKEN, 'folderINBOX', 40, true));
assert.equal(readDomainVersion('mail', TOKEN), vBeforeFail, 'mutasi gagal tidak men-bump versi');
failStatus = 0;

console.log('mail crossTab assertions passed');
