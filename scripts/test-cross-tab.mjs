import assert from 'node:assert/strict';

// ── Mock localStorage ────────────────────────────────────────────────────────
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

// ── Mock window event (storage event listener) ───────────────────────────────
const listeners = new Map(); // type → Set<fn>
globalThis.window = {
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners.get(type)?.delete(fn);
  },
};
function fireStorage(key) {
  const ev = { key };
  (listeners.get('storage') || []).forEach((fn) => fn(ev));
}

const { readDomainVersion, bumpDomainVersion, watchDomainVersion } = await import('../src/lib/crossTab.js');

const EMAIL = 'u@example.com';

// ── Awal: versi 0 ────────────────────────────────────────────────────────────
assert.equal(readDomainVersion('calendar', EMAIL), 0);

// ── Bump menulis timestamp > 0 ───────────────────────────────────────────────
const v1 = bumpDomainVersion('calendar', EMAIL);
assert.ok(v1 > 0);
assert.equal(readDomainVersion('calendar', EMAIL), v1);
assert.ok(storage.has('pcp_calendar_v_u@example.com'), 'key domain tersimpan');

// Scope per email — akun lain 0.
assert.equal(readDomainVersion('calendar', 'other@example.com'), 0);
assert.equal(readDomainVersion('contacts', EMAIL), 0, 'domain lain tidak terpengaruh');

// ── watchDomainVersion: invalidate saat versi berubah (tab lain) ─────────────
let invalidated = 0;
const cleanup = watchDomainVersion('calendar', EMAIL, () => { invalidated += 1; });

// Belum ada perubahan → tidak invalidate.
fireStorage('pcp_contacts_v_u@example.com'); // key domain lain → abaikan
assert.equal(invalidated, 0, 'perubahan domain lain tidak memicu invalidate');

// Tab lain bump → storage event dengan key domain → invalidate.
bumpDomainVersion('calendar', EMAIL);
fireStorage('pcp_calendar_v_u@example.com');
assert.equal(invalidated, 1, 'versi berubah → invalidate');

// Event dengan versi TIDAK berubah (key sama, nilai sama) → tidak invalidate.
fireStorage('pcp_calendar_v_u@example.com');
assert.equal(invalidated, 1, 'versi tidak berubah → tidak invalidate ulang');

// localStorage.clear() (e.key null) → anggap semua berubah → invalidate.
bumpDomainVersion('calendar', EMAIL);
fireStorage(null);
assert.equal(invalidated, 2, 'clear() memicu invalidate');

// Cleanup — listener dihapus, event tidak lagi memicu.
cleanup();
bumpDomainVersion('calendar', EMAIL);
fireStorage('pcp_calendar_v_u@example.com');
assert.equal(invalidated, 2, 'setelah cleanup, listener tidak aktif');

// ── Key rusak / non-numeric → dibaca 0 ───────────────────────────────────────
storage.set('pcp_calendar_v_u@example.com', 'garbage');
assert.equal(readDomainVersion('calendar', EMAIL), 0, 'nilai non-numeric dibaca 0');
bumpDomainVersion('calendar', EMAIL); // pulihkan

// ── Bump MONOTONIK: dua bump cepat (ms sama) tetap menghasilkan versi naik ──
const a = bumpDomainVersion('calendar', EMAIL);
const b = bumpDomainVersion('calendar', EMAIL);
assert.ok(b > a, 'bump kedua harus lebih besar (monotonik) walau dalam ms sama');

// ── Input invalid tidak throw ────────────────────────────────────────────────
assert.equal(bumpDomainVersion('calendar', ''), 0);
assert.equal(readDomainVersion('calendar', ''), 0);

console.log('crossTab assertions passed');
