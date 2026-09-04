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
 * Mulai polling periodik (dipakai di App.jsx).
 * @param {object} opts
 * @param {number}   opts.intervalMs  default 5 menit
 * @returns {() => void} fungsi cleanup (clearInterval).
 */
export function startDeployPolling({ intervalMs = 300_000, baseUrl = '', documentRef = typeof document !== 'undefined' ? document : undefined } = {}) {
  if (typeof window === 'undefined' || !documentRef) return () => {};
  const tick = () => {
    // Tab di background: skip — jangan fetch, jangan reload di belakang layar.
    if (documentRef.hidden) return;
    checkAndReloadOnNewDeploy({ baseUrl }).catch(() => {});
  };
  const id = window.setInterval(tick, intervalMs);
  return () => window.clearInterval(id);
}
