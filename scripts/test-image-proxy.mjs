import assert from 'node:assert/strict';
import { IMAGE_PROXY_PATH, isExternalImageUrl, toProxyUrl } from '../src/lib/imageProxy.js';

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

console.log('imageProxy assertions passed');
