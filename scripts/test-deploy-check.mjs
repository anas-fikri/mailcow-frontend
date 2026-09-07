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
  addEventListener: () => {},
  removeEventListener: () => {},
};
const hiddenDoc = { hidden: true };
const cleanup = startDeployPolling({ intervalMs: 10, documentRef: hiddenDoc });
assert.equal(typeof cleanup, 'function');
cleanup(); // tidak boleh throw

// ── Kontrak App.jsx: poller WAJIB memakai baseUrl '/webmail' ──────────────
// Regresi nyata (2026-09-05): tanpa baseUrl, fetchServerBuildVersion fetch
// /index.html yang 404 → poller no-op diam-diam → tab basi tak pernah reload.
const appSrc = (await import('node:fs')).readFileSync('src/App.jsx', 'utf8');
assert.ok(
  /startDeployPolling\(\{[^}]*baseUrl:\s*['"]\/webmail['"]/.test(appSrc),
  'App.jsx startDeployPolling harus memakai baseUrl /webmail (bukan root 404)'
);
// Kontrak latensi (2026-09-07): interval 60 dtk — pelajaran monitoring, tab
// basi dgn poll 5 mkt butuh ~11 menit reload (kena 415 gambar lama).
assert.ok(
  /startDeployPolling\(\{[^}]*intervalMs:\s*60_000/.test(appSrc),
  'App.jsx startDeployPolling harus interval 60 detik (pickup deploy cepat)'
);
// SW v8: probe deploy (?bv=) tidak boleh di-cache — URL unik per poll,
// cache membengkak ~1440 entri/hari/tab dengan poll 60 dtk.
const swSrc = (await import('node:fs')).readFileSync('public/sw.js', 'utf8');
assert.ok(
  swSrc.includes('pcp-webmail-v8') && /isDeployProbe/.test(swSrc),
  'sw.js v8 harus skip cache utk probe deploy (?bv=)'
);
// LoginPage: cek staleness saat login gagal (kasus tab basi menampilkan pesan lama).
const loginSrc = (await import('node:fs')).readFileSync('src/pages/LoginPage.jsx', 'utf8');
assert.ok(
  loginSrc.includes("checkAndReloadOnNewDeploy({ baseUrl: '/webmail' })"),
  'LoginPage harus cek deploy baru saat login gagal (tab basi)'
);

// ── startDeployPolling: cek segera saat tab visible kembali (throttled) ──
// Regresi nyata (2026-09-07): tab di-background sepanjang hari hanya dicek
// saat tick interval — user kembali ke tab harusnya trigger cek SEGERA.
{
  // Node tak punya `document` — getEmbeddedBuildVersion() default-param-nya
  // `document`. Stub dgn versi SAMA dgn fixture server (html1 = 'abc-123')
  // agar checkAndReloadOnNewDeploy tidak masuk jalur reload.
  globalThis.document = { querySelector: () => ({ getAttribute: (k) => (k === 'content' ? 'abc-123' : null) }) };
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount += 1; return { ok: true, text: async () => html1 }; };
  let handler = null;
  const doc = {
    hidden: true,
    addEventListener: (_t, h) => { handler = h; },
    removeEventListener: () => {},
  };
  const ticks = [];
  const win = {
    setInterval: (fn) => { ticks.push(fn); return 1; },
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const cleanup2 = startDeployPolling({ intervalMs: 60_000, documentRef: doc, windowRef: win });
  // Tab masih hidden → tick & visibilitychange tidak boleh fetch.
  ticks[0]();
  handler?.();
  assert.equal(fetchCount, 0, 'tab hidden → tidak fetch');
  // Tab visible kembali → cek segera (satu fetch).
  doc.hidden = false;
  handler?.();
  assert.equal(fetchCount, 1, 'visibilitychange saat visible → fetch segera');
  // Alt-tab cepat (<30 dtk) → di-throttle, tidak fetch lagi.
  handler?.();
  assert.equal(fetchCount, 1, 'throttle 30 dtk → alt-tab cepat tidak fetch ulang');
  cleanup2();
}

console.log('✅ test-deploy-check: semua assertion lolos');
