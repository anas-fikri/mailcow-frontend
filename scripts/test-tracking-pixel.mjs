import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { proxyExternalImages, IMAGE_PROXY_PATH } from '../src/lib/imageProxy.js';

const TRACKER = 'https://tracker.example.com';

// Extract every external http(s) URL that would trigger a browser fetch from the
// rendered HTML: img src, img/source srcset, inline style url(), and <style> url().
function externalUrlsIn(html, doc) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const urls = [];

  for (const img of tpl.content.querySelectorAll('img[src]')) {
    const s = (img.getAttribute('src') || '').trim();
    if (/^https?:\/\//i.test(s)) urls.push(s);
  }
  for (const el of tpl.content.querySelectorAll('img[srcset], source[srcset]')) {
    const srcset = el.getAttribute('srcset') || '';
    for (const part of srcset.split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (/^https?:\/\//i.test(u)) urls.push(u);
    }
  }
  for (const el of tpl.content.querySelectorAll('[style]')) {
    const style = el.getAttribute('style') || '';
    for (const m of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      if (/^https?:\/\//i.test(m[2].trim())) urls.push(m[2].trim());
    }
  }
  for (const el of tpl.content.querySelectorAll('style')) {
    for (const m of (el.textContent || '').matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      if (/^https?:\/\//i.test(m[2].trim())) urls.push(m[2].trim());
    }
  }
  return urls;
}

// A realistic tracking-pixel email using every external-image vector.
const sampleHtml = `
<div style="font-family:Arial">
  <!-- 1. classic 1x1 tracking pixel -->
  <img src="${TRACKER}/pixel.gif" width="1" height="1" alt="">
  <!-- 2. banner image -->
  <img src="${TRACKER}/banner.png" width="600">
  <!-- 3. srcset responsive image -->
  <img srcset="${TRACKER}/hero-480.png 480w, ${TRACKER}/hero-800.png 800w">
  <!-- 4. <picture><source> -->
  <picture>
    <source srcset="${TRACKER}/pic-2x.png 2x, ${TRACKER}/pic-1x.png 1x">
    <img src="${TRACKER}/pic-fallback.png" alt="pic">
  </picture>
  <!-- 5. CSS background-image inline -->
  <div style="background-image:url('${TRACKER}/bg.png')">block</div>
  <!-- 6. <style> block -->
  <style>.hero{background-image:url("${TRACKER}/hero-bg.png")}</style>
</div>
`;

const { document } = parseHTML('<html><body></body></html>');

// ── Before rewrite: every vector leaks a direct external URL ────────────────
const before = externalUrlsIn(sampleHtml, document);
assert.ok(before.length >= 8, `expected many external urls, got ${before.length}`);
assert.ok(before.every((u) => u.startsWith(TRACKER)), 'pre-rewrite urls should all be tracker');

// ── After rewrite: zero direct external URLs remain ─────────────────────────
const rewritten = proxyExternalImages(sampleHtml, document);

const after = externalUrlsIn(rewritten, document);
assert.equal(after.length, 0, `direct external urls leak after rewrite: ${JSON.stringify(after)}`);

// Every image-bearing slot now points at the proxy.
const tpl = document.createElement('template');
tpl.innerHTML = rewritten;
// 3 img src + 1 img srcset + 1 source srcset = 5 elemen (2 CSS vector dihitung terpisah).
const proxiedCount =
  tpl.content.querySelectorAll(`img[src^="${IMAGE_PROXY_PATH}"], img[srcset*="${IMAGE_PROXY_PATH}"], source[srcset*="${IMAGE_PROXY_PATH}"]`).length;
assert.equal(proxiedCount, 5, `expected 5 proxied src/srcset, got ${proxiedCount}`);

// Proxy URL encodes the original tracker URL (round-trippable).
const px = tpl.content.querySelector('img[src^="/api/image-proxy"]');
const proxiedUrl = px.getAttribute('src');
const decoded = decodeURIComponent(proxiedUrl.split('url=')[1]);
assert.equal(decoded, `${TRACKER}/pixel.gif`);

// CSS url() in inline style + <style> block are proxied too.
const styledEl = Array.from(tpl.content.querySelectorAll('[style]')).find((el) =>
  (el.getAttribute('style') || '').includes(IMAGE_PROXY_PATH));
assert.ok(styledEl, 'inline style url() must be proxied');
assert.ok(!(styledEl.getAttribute('style') || '').includes(TRACKER), 'inline style must not keep tracker url');

const styleBlock = tpl.content.querySelector('style');
assert.ok((styleBlock.textContent || '').includes(IMAGE_PROXY_PATH), 'style block url() must be proxied');
assert.ok(!(styleBlock.textContent || '').includes(TRACKER), 'style block must not keep tracker url');

console.log('tracking-pixel assertions passed');
