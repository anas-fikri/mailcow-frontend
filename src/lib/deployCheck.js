/**
 * Deteksi deploy baru untuk tab SPA yang terbuka lama.
 *
 * MASALAH: SPA dimuat sekali per tab. Setelah deploy (rsync --delete), tab
 * lama tetap menjalankan chunk LAMA di memori — tidak ada error, tidak ada
 * reload, jadi perbaikan bug (mis. urutan sort email) tidak terasa sampai
 * user menutup/reload tab sendiri. lazyWithReload (App.jsx) hanya menyelamatkan
 * kasus chunk 404 keras, bukan "kode lama diam-diam masih jalan".
 *
 * SOLUSI: build menempel fingerprint `<meta name="build-version">` di
 * index.html (lihat vite.config.js). SPA mem-poll file itu (cache-bust query);
 * jika versi server ≠ versi saat tab dimuat → reload sekali (guard sessionStorage
 * anti loop). Poll hanya saat tab visible — background tab tidak perlu reload.
 *
 * LATENSI (pelajaran monitoring 2026-09-07): interval 5 menit + tanpa cek saat
 * tab kembali visible membuat tab basi butuh ~11 menit untuk reload. Sekarang:
 * - interval 60 detik (fetch index.html ~1KB, visible tab saja — beban nginx
 *   static file, dapat diabaikan), dan
 * - cek SEGERA saat tab visible kembali / window focus (visibilitychange +
 *   focus), di-throttle ≥30 dtk antar-cek agar alt-tab cepat tidak fetch-storm.
 */

export const BUILD_META_SELECTOR = 'meta[name="build-version"]';

/** Baca build-version yang tertanam saat tab ini dimuat. 'unknown' = meta tidak ada. */
export function getEmbeddedBuildVersion(doc = document) {
  try {
    const meta = doc.querySelector(BUILD_META_SELECTOR);
    const v = meta?.getAttribute('content');
    return v ? String(v) : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch build-version terbaru dari server.
 * @returns {Promise<string|null>} versi server, atau null bila gagal/offline.
 *   null (bukan 'unknown') agar gangguan jaringan tidak memicu reload.
 */
export async function fetchServerBuildVersion(baseUrl = '') {
  try {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${baseUrl}/index.html${sep}bv=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractBuildVersion(html) || 'unknown';
  } catch {
    return null;
  }
}

/** Extract nilai build-version dari string HTML index.html. */
export function extractBuildVersion(html) {
  if (typeof html !== 'string') return null;
  const m = html.match(/<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']build-version["']/i);
  return m ? m[1] : null;
}

/**
 * Putusan apakah tab perlu reload.
 * @returns {boolean} true hanya jika server punya versi BEDA dari versi tab,
 *   dan keduanya diketahui (tidak 'unknown') — perbedaan 'unknown' bisa berarti
 *   proxy/CDN lama atau jaringan aneh; jangan reload untuk itu.
 */
export function shouldReloadForDeploy(serverVersion, embeddedVersion) {
  if (!serverVersion || !embeddedVersion) return false;
  if (serverVersion === 'unknown' || embeddedVersion === 'unknown') return false;
  return serverVersion !== embeddedVersion;
}

/**
 * Jalankan poll sekali dan reload bila perlu. Reload memakai flag sessionStorage
 * dengan window waktu (pola lazyWithReload di App.jsx) untuk mencegah loop.
 * @returns {Promise<boolean>} true bila reload dipicu.
 */
export async function checkAndReloadOnNewDeploy({ baseUrl = '', embedded, reload = (u) => { window.location.reload(u); } } = {}) {
  const RELOAD_KEY = '__pcp_deploy_reload';
  const WINDOW_MS = 30_000;
  const embeddedVersion = embedded ?? getEmbeddedBuildVersion();
  const serverVersion = await fetchServerBuildVersion(baseUrl);
  if (!shouldReloadForDeploy(serverVersion, embeddedVersion)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last <= WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* storage terbatas — tetap reload sekali */ }
  reload();
  return true;
}

/**
 * Mulai polling periodik + cek saat tab visible kembali / focus (dipakai App.jsx).
 * @param {object} opts
 * @param {number}   opts.intervalMs   default 60 detik (poll visible tab saja)
 * @param {Document} [opts.documentRef] injeksi utk test
 * @param {Window}   [opts.windowRef]  injeksi utk test (default window global)
 * @returns {() => void} fungsi cleanup (clearInterval + lepas listener).
 */
export function startDeployPolling({ intervalMs = 60_000, baseUrl = '', documentRef = typeof document !== 'undefined' ? document : undefined, windowRef } = {}) {
  if (typeof window === 'undefined' || !documentRef) return () => {};
  const win = windowRef ?? window;
  const THROTTLE_MS = 30_000;
  let lastCheckAt = 0;
  const runCheck = () => {
    // Tab di background: skip — jangan fetch, jangan reload di belakang layar.
    if (documentRef.hidden) return;
    // Throttle: cek interval + cek visibility/focus berbagi jatah ≥30 dtk,
    // sehingga alt-tab cepat tidak memicu deretan fetch.
    const now = Date.now();
    if (now - lastCheckAt < THROTTLE_MS) return;
    lastCheckAt = now;
    checkAndReloadOnNewDeploy({ baseUrl }).catch(() => {});
  };
  // visibilitychange: tab lama yang di-background sepanjang hari dicek SEGERA
  // saat user kembali — bukan menunggu tick interval berikutnya.
  const onVisible = () => runCheck();
  const id = win.setInterval(runCheck, intervalMs);
  try { documentRef.addEventListener?.('visibilitychange', onVisible); } catch { /* noop */ }
  try { win.addEventListener?.('focus', onVisible); } catch { /* noop */ }
  return () => {
    win.clearInterval(id);
    try { documentRef.removeEventListener?.('visibilitychange', onVisible); } catch { /* noop */ }
    try { win.removeEventListener?.('focus', onVisible); } catch { /* noop */ }
  };
}
