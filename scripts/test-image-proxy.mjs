import assert from 'node:assert/strict';
import { IMAGE_PROXY_PATH, isExternalImageUrl, toProxyUrl, rewriteSrcset, rewriteCssUrls } from '../src/lib/imageProxy.js';

assert.equal(IMAGE_PROXY_PATH, '/api/image-proxy');

// ── isExternalImageUrl ────────────────────────────────────────────────────────
assert.equal(isExternalImageUrl('https://example.com/a.jpg'), true);
assert.equal(isExternalImageUrl('http://example.com/a.jpg'), true);
assert.equal(isExternalImageUrl('data:image/png;base64,xxx'), false);
assert.equal(isExternalImageUrl('cid:inline-image'), false);
assert.equal(isExternalImageUrl('/SOGo/so/user/Mail/0/view'), false);
assert.equal(isExternalImageUrl('ftp://example.com/a.jpg'), false);
assert.equal(isExternalImageUrl('javascript:alert(1)'), false);
assert.equal(isExternalImageUrl('//example.com/a.jpg'), false); // protocol-relative
assert.equal(isExternalImageUrl(''), false);
assert.equal(isExternalImageUrl(null), false);
assert.equal(isExternalImageUrl(undefined), false);

// ── toProxyUrl ────────────────────────────────────────────────────────────────
assert.equal(
  toProxyUrl('https://example.com/a.jpg'),
  '/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fa.jpg'
);
const withQuery = toProxyUrl('https://example.com/pic.png?w=100&h=200');
assert.ok(withQuery.startsWith('/api/image-proxy?url='));
assert.ok(withQuery.includes('%3Fw%3D100'));
// Round-trip: decode kembali ke URL asli.
assert.equal(decodeURIComponent(withQuery.split('url=')[1]), 'https://example.com/pic.png?w=100&h=200');

// ── rewriteSrcset ───────────────────────────────────────────────────────────
const s1 = rewriteSrcset('https://a.com/1.jpg 1x, https://a.com/2.jpg 2x');
assert.ok(s1.includes('/api/image-proxy?url='));
assert.ok(s1.includes(' 1x'));
assert.ok(s1.includes(' 2x'));
// Descriptor width + densitas campuran (whitespace asli dipertahankan).
assert.equal(
  rewriteSrcset('https://a.com/1.jpg 480w, https://a.com/2.jpg 800w'),
  '/api/image-proxy?url=' + encodeURIComponent('https://a.com/1.jpg') + ' 480w, ' +
  '/api/image-proxy?url=' + encodeURIComponent('https://a.com/2.jpg') + ' 800w'
);
// Kandidat non-eksternal (data:) tidak diubah, whitespace dipertahankan.
assert.equal(
  rewriteSrcset('data:image/png;base64,xxx 1x, /so/a.jpg 2x'),
  'data:image/png;base64,xxx 1x, /so/a.jpg 2x'
);
// Tidak ada perubahan → return string yang sama.
assert.equal(rewriteSrcset('/rel/a.jpg 1x'), '/rel/a.jpg 1x');
assert.equal(rewriteSrcset(''), '');
assert.equal(rewriteSrcset(null), null);

// ── rewriteCssUrls ───────────────────────────────────────────────────────────
assert.equal(
  rewriteCssUrls("background-image:url('https://a.com/pic.png')"),
  "background-image:url('/api/image-proxy?url=" + encodeURIComponent('https://a.com/pic.png') + "')"
);
// Double quote.
assert.equal(
  rewriteCssUrls('background-image: url("https://a.com/p.png")'),
  'background-image: url("/api/image-proxy?url=' + encodeURIComponent('https://a.com/p.png') + '")'
);
// Tanpa quote.
assert.equal(
  rewriteCssUrls('background:url(https://a.com/p.png)'),
  'background:url(/api/image-proxy?url=' + encodeURIComponent('https://a.com/p.png') + ')'
);
// url() non-eksternal tidak diubah.
assert.equal(rewriteCssUrls('background-image:url(data:image/png;base64,x)'), 'background-image:url(data:image/png;base64,x)');
assert.equal(rewriteCssUrls('background-image:url(/so/a.png)'), 'background-image:url(/so/a.png)');
// Multiple url() + gradient tidak rusak.
const css = 'background-image:url("https://a.com/1.png"), linear-gradient(#fff,#000)';
const cssOut = rewriteCssUrls(css);
assert.ok(cssOut.includes('/api/image-proxy?url='));
assert.ok(cssOut.includes('linear-gradient(#fff,#000)'));
// Tidak ada url() → sama.
assert.equal(rewriteCssUrls('color:red'), 'color:red');
assert.equal(rewriteCssUrls(''), '');
assert.equal(rewriteCssUrls(null), null);

console.log('imageProxy assertions passed');

// ── normalizeOwnSogoUrl (fix 415: URL SOGo absolut dari kutipan/forward) ─────
{
  const { normalizeOwnSogoUrl } = await import('../src/lib/imageProxy.js');
  // milik sendiri → path relatif
  assert.equal(
    normalizeOwnSogoUrl('https://mail.pcpexpress.com/SOGo/so/u%40d/Mail/0/folderINBOX/295/1/2/image001.jpg'),
    '/SOGo/so/u%40d/Mail/0/folderINBOX/295/1/2/image001.jpg'
  );
  assert.equal(
    normalizeOwnSogoUrl('https://mail.pcpexpress.co.id/SOGo/so/x/295/1/3/image002.png'),
    '/SOGo/so/x/295/1/3/image002.png'
  );
  // bukan SOGo → null (tetap diproxy)
  assert.equal(normalizeOwnSogoUrl('https://example.com/SOGo/so/x'), null);
  // SOGo tapi host tak dikenal → null (eksternal, diproxy)
  assert.equal(normalizeOwnSogoUrl('https://evil.example/SOGo/so/x'), null);
  // path non-SOGo di host sendiri → null
  assert.equal(normalizeOwnSogoUrl('https://mail.pcpexpress.com/webmail/index.html'), null);
  // relative/cid/data → null
  assert.equal(normalizeOwnSogoUrl('/SOGo/so/x'), null);
  assert.equal(normalizeOwnSogoUrl('cid:image001.png@01DC'), null);
}
