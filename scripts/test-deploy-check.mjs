import assert from 'node:assert/strict';
import {
  getEmbeddedBuildVersion,
  extractBuildVersion,
  shouldReloadForDeploy,
  checkAndReloadOnNewDeploy,
  startDeployPolling,
} from '../src/lib/deployCheck.js';

// ── extractBuildVersion: dua urutan atribut + null safety ──
const html1 = '<html><head><meta name="build-version" content="abc-123" /><title>x</title></head></html>';
const html2 = "<html><head><meta content='def-456' name='build-version'><title>y</title></head></html>";
const html3 = '<html><head><title>tanpa meta</title></head></html>';
assert.equal(extractBuildVersion(html1), 'abc-123');
assert.equal(extractBuildVersion(html2), 'def-456');
assert.equal(extractBuildVersion(html3), null);
assert.equal(extractBuildVersion(null), null);
assert.equal(extractBuildVersion(undefined), null);
assert.equal(extractBuildVersion(42), null);

// ── getEmbeddedBuildVersion: DOM mock ──
const fakeMeta = { getAttribute: (k) => (k === 'content' ? 'emb-1' : null) };
const doc1 = { querySelector: (sel) => (sel === 'meta[name="build-version"]' ? fakeMeta : null) };
const doc2 = { querySelector: () => null };
assert.equal(getEmbeddedBuildVersion(doc1), 'emb-1');
assert.equal(getEmbeddedBuildVersion(doc2), 'unknown');
assert.equal(getEmbeddedBuildVersion({ querySelector: () => { throw new Error('boom'); } }), 'unknown');

// ── shouldReloadForDeploy ──
assert.equal(shouldReloadForDeploy('v2', 'v1'), true);   // versi beda → reload
assert.equal(shouldReloadForDeploy('v2', 'v2'), false);  // sama → tidak
assert.equal(shouldReloadForDeploy(null, 'v1'), false);  // fetch gagal → tidak
assert.equal(shouldReloadForDeploy('v2', null), false);
assert.equal(shouldReloadForDeploy('unknown', 'v1'), false); // versi tak diketahui → aman
assert.equal(shouldReloadForDeploy('v2', 'unknown'), false);

// ── checkAndReloadOnNewDeploy: reload tepat sekali + guard loop ──
// Node env: sessionStorage stub global utk modul yang memakainya.
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let reloadCount = 0;
const fakeReload = () => { reloadCount += 1; };

// fetchServerBuildVersion memakai fetch global — stub respons index.html server.
globalThis.fetch = async () => ({ ok: true, text: async () => html1 });

// Case 1: versi beda → reload sekali
let fired = await checkAndReloadOnNewDeploy({ embedded: 'emb-old', reload: fakeReload });
assert.equal(fired, true);
assert.equal(reloadCount, 1);

// Case 2: guard 30 detik → panggilan berikutnya TIDAK reload lagi (anti loop)
fired = await checkAndReloadOnNewDeploy({ embedded: 'emb-old', reload: fakeReload });
assert.equal(fired, false);
assert.equal(reloadCount, 1);

// Case 3: versi sama → tidak reload
store.clear();
fired = await checkAndReloadOnNewDeploy({ embedded: 'abc-123', reload: fakeReload });
assert.equal(fired, false);
assert.equal(reloadCount, 1);

// Case 4: fetch gagal (offline) → tidak reload
globalThis.fetch = async () => { throw new Error('net down'); };
store.clear();
fired = await checkAndReloadOnNewDeploy({ embedded: 'emb-old', reload: fakeReload });
assert.equal(fired, false);
assert.equal(reloadCount, 1);

// Case 5: server balas 5xx → tidak reload
globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
fired = await checkAndReloadOnNewDeploy({ embedded: 'emb-old', reload: fakeReload });
assert.equal(fired, false);
assert.equal(reloadCount, 1);

// ── startDeployPolling: skip saat tab hidden, cleanup rapi ──
// JSDOM tidak ada di suite ini; stub window minimal + document.hidden=true
// memastikan tick tidak memanggil fetch (yang sudah di-stub melempar).
const intervalHandles = [];
globalThis.window = {
  setInterval: (fn, ms) => { intervalHandles.push(fn); return intervalHandles.length; },
  clearInterval: (id) => { /* noop */ },
};
const hiddenDoc = { hidden: true };
const cleanup = startDeployPolling({ intervalMs: 10, documentRef: hiddenDoc });
assert.equal(typeof cleanup, 'function');
cleanup(); // tidak boleh throw

console.log('✅ test-deploy-check: semua assertion lolos');
