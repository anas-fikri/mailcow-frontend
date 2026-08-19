/**
 * Remote image proxy — anti tracking-pixel (pola Gmail).
 *
 * Gambar eksternal (http/https) di-rewrite ke /api/image-proxy sehingga IP user
 * TIDAK bocor ke pengirim (tracking pixel 1x1 / read-receipt). Backend
 * (server.js) yang mengambil gambar, bukan browser user.
 *
 * Hanya dipakai di path RENDER email (MessageReader). Quote balasan/forward dan
 * editor compose TETAP memakai URL asli — karena konten itu dikirim sebagai
 * email dan harus punya URL yang valid untuk penerima.
 */

export const IMAGE_PROXY_PATH = '/api/image-proxy';

/** True bila src adalah URL gambar eksternal (http/https), bukan data:/cid:/relatif. */
export function isExternalImageUrl(src) {
  if (typeof src !== 'string') return false;
  return /^https?:\/\//i.test(src.trim());
}

/** Bangun URL proxy untuk sebuah URL gambar eksternal. */
export function toProxyUrl(src) {
  return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(src)}`;
}

/**
 * Rewrite src eksternal pada HTML yang SUDAH DOMPurify-sanitized ke proxy.
 * Browser-only (pakai DOM API, bukan string concat → aman dari injection).
 * Kembalikan string yang sama bila tidak ada perubahan.
 */
export function proxyExternalImages(sanitizedHtml) {
  if (!sanitizedHtml) return sanitizedHtml;
  if (typeof document === 'undefined') return sanitizedHtml;

  const tpl = document.createElement('template');
  tpl.innerHTML = sanitizedHtml;

  const imgs = tpl.content.querySelectorAll('img[src]');
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (isExternalImageUrl(src)) {
      img.setAttribute('src', toProxyUrl(src));
    }
  }

  return tpl.innerHTML;
}
