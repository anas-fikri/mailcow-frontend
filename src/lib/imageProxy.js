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

/**
 * Host yang dianggap "milik sendiri" untuk SOGo part URL. URL absolut ke
 * host-host ini JANGAN diproxy (butuh cookie sesi user — proxy tidak punya
 * sesi → SOGo balas halaman login HTML → 415). Di-rewrite jadi path relatif.
 * Env override: VITE_SOGO_KNOWN_HOSTS (dipisah koma).
 */
export const SOGO_KNOWN_HOSTS = (import.meta.env?.VITE_SOGO_KNOWN_HOSTS ||
  'mail.example.net,mail.example.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

function currentHost() {
  try { return globalThis.location?.host || ''; } catch { return ''; }
}

/**
 * Normalisasi absolut SOGo URL milik sendiri → path relatif.
 * Return null bila bukan kandidat (biarkan caller proxy-kan).
 */
export function normalizeOwnSogoUrl(src) {
  if (typeof src !== 'string') return null;
  const raw = src.trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!u.pathname.startsWith('/SOGo/')) return null;
  if (u.host !== currentHost() && !SOGO_KNOWN_HOSTS.includes(u.host)) return null;
  return (u.pathname + u.search) || null;
}

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
 * Rewrite srcset eksternal. Format: kandidat "URL [descriptor]" dipisah koma.
 * Hanya kandidat yang dimulai http(s) yang di-rewrite; kandidat lain (data:, dll)
 * dibiarkan utuh dan whitespace asli dipertahankan.
 * Kembalikan string yang sama bila tidak ada perubahan.
 */
export function rewriteSrcset(srcset) {
  if (typeof srcset !== 'string' || !srcset.trim()) return srcset;
  let changed = false;
  const parts = srcset.split(',');
  const rewritten = parts.map((part) => {
    const lead = part.slice(0, part.length - part.trimStart().length);
    const trimmed = part.trimStart();
    const m = trimmed.match(/^(\S+)(\s+.*)?$/);
    if (!m) return part;
    const url = m[1];
    const descriptor = m[2] || '';
    if (isExternalImageUrl(url)) {
      changed = true;
      return `${lead}${toProxyUrl(url)}${descriptor}`;
    }
    return part;
  });
  return changed ? rewritten.join(',') : srcset;
}

/**
 * Rewrite semua url(...) eksternal pada teks CSS (inline style attribute atau
 * isi <style>). Menangkap background-image, background, content, list-style,
 * @import, dll. Quote (', ", atau tanpa quote) dipertahankan.
 * Kembalikan string yang sama bila tidak ada perubahan.
 */
export function rewriteCssUrls(cssText) {
  if (typeof cssText !== 'string' || !cssText) return cssText;
  let changed = false;
  const out = cssText.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, quote, url) => {
    if (isExternalImageUrl(url)) {
      changed = true;
      return `url(${quote}${toProxyUrl(url)}${quote})`;
    }
    return whole;
  });
  return changed ? out : cssText;
}

/**
 * Rewrite src eksternal pada HTML yang SUDAH DOMPurify-sanitized ke proxy.
 * Pakai DOM API (bukan string concat → aman dari injection). Menangani
 * <img src>, <img|source srcset>, dan CSS url(...) pada style attribute +
 * <style> block. Kembalikan string yang sama bila tidak ada perubahan.
 *
 * `doc` adalah implementasi DOM (default: global `document`). Injectable agar
 * bisa diuji di Node memakai DOM buatan (linkedom) tanpa browser asli.
 * Pakai wrapper <div> (bukan <template>) karena getter innerHTML <template>
 * di linkedom tidak merefleksikan mutasi pada content-nya.
 */
export function proxyExternalImages(sanitizedHtml, doc) {
  if (!sanitizedHtml) return sanitizedHtml;
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return sanitizedHtml;

  const wrapper = d.createElement('div');
  wrapper.innerHTML = sanitizedHtml;

  // <img src>
  const imgs = wrapper.querySelectorAll('img[src]');
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!isExternalImageUrl(src)) continue;
    // URL SOGo milik sendiri (dari kutipan/forward yang menyisipkan URL
    // absolut) → relative path dgn sesi user, BUKAN proxy (proxy tanpa
    // sesi hanya dapat halaman login → 415, kasus 4.809x di log produksi).
    const own = normalizeOwnSogoUrl(src);
    if (own) {
      img.setAttribute('src', own);
    } else {
      img.setAttribute('src', toProxyUrl(src));
    }
  }

  // <img srcset> + <source srcset>
  const srcsets = wrapper.querySelectorAll('img[srcset], source[srcset]');
  for (const el of srcsets) {
    const raw = el.getAttribute('srcset') || '';
    const next = rewriteSrcsetWithOwnSogo(raw);
    if (next !== raw) {
      el.setAttribute('srcset', next);
    }
  }

  // CSS url(...) pada inline style attribute.
  const styled = wrapper.querySelectorAll('[style]');
  for (const el of styled) {
    const next = rewriteCssUrlsWithOwnSogo(el.getAttribute('style') || '');
    if (next !== el.getAttribute('style')) {
      el.setAttribute('style', next);
    }
  }

  // CSS url(...) pada <style> block.
  const styles = wrapper.querySelectorAll('style');
  for (const el of styles) {
    const next = rewriteCssUrlsWithOwnSogo(el.textContent || '');
    if (next !== el.textContent) {
      el.textContent = next;
    }
  }

  return wrapper.innerHTML;
}

/** rewriteSrcset + normalisasi URL SOGo milik sendiri dulu per kandidat.
 *  Kandidat yang bukan own-SOgo tetap di-proxied (jangan sampai tracker
 *  lolos mentah hanya karena satu kandidat lain adalah SOGo). */
function rewriteSrcsetWithOwnSogo(srcset) {
  if (typeof srcset !== 'string' || !srcset.trim()) return srcset;
  const parts = srcset.split(',');
  const out = parts.map((part) => {
    const lead = part.slice(0, part.length - part.trimStart().length);
    const trimmed = part.trimStart();
    const m = trimmed.match(/^(\S+)(\s+.*)?$/);
    if (!m) return part;
    const own = normalizeOwnSogoUrl(m[1]);
    if (own) return `${lead}${own}${m[2] || ''}`;
    return `${lead}${rewriteSrcset(trimmed)}${m[2] || ''}`;
  });
  return out.join(',');
}

/** rewriteCssUrls + normalisasi URL SOGo milik sendiri dulu. */
function rewriteCssUrlsWithOwnSogo(cssText) {
  if (typeof cssText !== 'string' || !cssText) return cssText;
  const out = cssText.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, quote, url) => {
    const own = normalizeOwnSogoUrl(url);
    if (own) return `url(${quote}${own}${quote})`;
    return whole;
  });
  return rewriteCssUrls(out);
}
