/* Mailcow Webmail — Service Worker minimal & aman.
 *
 * v7: network-first untuk navigasi dan asset hashed. Jika jaringan gagal,
 * fallback cache hanya boleh mengembalikan Response valid. Untuk navigasi,
 * cache fallback tidak dipakai karena shell lama dapat mencampur chunk dengan
 * deployment baru dan memicu React #310.
 *
 * v8: JANGAN cache request probe deploy (`?bv=<ts>`, cache: 'no-store') —
 * URL-nya unik per poll sehingga entri tak pernah terbaca lagi; dengan poll
 * 60 dtk (deployCheck) cache membengkak ~1440 entri/hari/tab. Bump versi
 * membersihkan akumulasi entri probe dari poller 5 menit sebelumnya.
 */

const CACHE_NAME = 'pcp-webmail-v8';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheableResponse(response) {
  // Hanya response ok. Opaque (cross-origin/no-cors) dan opaqueredirect tidak
  // pernah di-cache: tidak bisa divalidasi, dan di skenario ini (GET same-origin
  // /webmail/ non-api) redirect cross-origin tidak mungkin terjadi.
  return response instanceof Response && response.ok;
}

// Probe deploy-check selalu network-only: URL-nya unik (?bv=<timestamp>)
// sehingga entri cache tidak pernah terbaca — hanya membuang storage.
function isDeployProbe(request) {
  try { return new URL(request.url).searchParams.has('bv'); } catch { return false; }
}

async function networkFirst(request) {
  const cacheable = !isDeployProbe(request);
  try {
    const response = await fetch(request);
    if (cacheable && isCacheableResponse(response)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    // Never return undefined/null from respondWith. A cached asset is safe as
    // an offline fallback; a cached HTML shell is deliberately excluded to
    // avoid pairing an old index with a different build's chunks.
    if (request.mode !== 'navigate') {
      const cached = await caches.match(request).catch(() => undefined);
      if (cached instanceof Response) return cached;
    }
    return new Response(
      request.mode === 'navigate' ? 'Aplikasi membutuhkan koneksi untuk memuat versi terbaru.' : '',
      {
        status: request.mode === 'navigate' ? 503 : 504,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/webmail/')) return;
  if (url.pathname.startsWith('/webmail/api/') || url.pathname.includes('/SOGo/')) return;

  event.respondWith(networkFirst(request));
});
