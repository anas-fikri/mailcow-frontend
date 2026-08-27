/* PCP Express Webmail — Service Worker minimal & aman.
 *
 * Kebijakan (REVISI v6 — memperbaiki campuran chunk antar-build yang
 * memicu React #310 / duplikat runtime):
 * - API (/api/*) & SOGo TIDAK PERNAH di-cache (data email sensitif + token).
 * - Navigasi (index.html) → network-first, fallback cache offline.
 * - SEMUA asset ber-hash (index-*.js, *.css, dst.):
 *     NETWORK-FIRST. Alasan: asset ber-hash SELALU menunjuk konten tetap,
 *     jadi jaringan memberi build konsisten dari HEAD. Sebelumnya pakai
 *     stale-while-revalidate yang bisa menyajikan CHUNK CAMPURAN antar-build
 *     (mis. index lama + api baru) dalam satu render → duplikat salinan React
 *     → Minified React error #310. Cache hanya dipakai sebagai cadangan saat
 *     offline, dan di-overwrite setiap berhasil fetch.
 */

const CACHE_NAME = 'pcp-webmail-v6';

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

  // Jangan pernah cache API / SOGo.
  if (url.pathname.startsWith('/webmail/api/') || url.pathname.includes('/SOGo/')) return;

  // Navigasi & ASSET SAMA-SAMA network-first (konsistensi bundle).
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaqueredirect')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});