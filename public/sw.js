/* PCP Express Webmail — Service Worker minimal & aman.
 *
 * Kebijakan:
 * - API (/api/*) TIDAK PERNAH di-cache (data email sensitif + token sesi).
 * - Navigasi (index.html) → network-first, fallback cache (offline shell).
 * - Assets ber-hash (index-*.js, *.css) → stale-while-revalidate: cepat dari
 *   cache, lalu refresh cache dari jaringan.
 * - Navigasi network-first MEMASTIKAN index.html baru (dengan hash aset baru)
 *   diambil setiap kali user membuka webmail → aset lama otomatis tergantikan
 *   tanpa perlu bump cache version secara manual.
 */
const CACHE_NAME = 'pcp-webmail-v5';

self.addEventListener('install', (event) => {
  // Jangan tahan SW aktif sampai shell siap — instal langsung.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Hanya tangani GET same-origin dalam scope /webmail/.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/webmail/')) return;

  // Jangan pernah cache endpoint API / SOGo.
  if (url.pathname.startsWith('/webmail/api/') || url.pathname.includes('/SOGo/')) return;

  // Navigasi → network-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/webmail/')))
    );
    return;
  }

  // Asset ber-hash → stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
