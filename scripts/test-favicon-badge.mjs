import assert from 'node:assert/strict';

// Fake DOM minimal: link[rel=icon] + canvas stub deterministik.
function makeDoc({ withCanvas = true } = {}) {
  const links = [];
  const canvases = [];
  const doc = {
    defaultView: { HTMLCanvasElement: withCanvas ? function CanvasStub() {} : undefined, Image: function ImageStub() {} },
    head: { appendChild: (el) => links.push(el) },
    createElement(tag) {
      if (tag === 'link') return { rel: '', _href: '', getAttribute() { return this._href; }, setAttribute(k, v) { if (k === 'href') this._href = v; } };
      if (tag === 'canvas') {
        const c = { width: 0, height: 0, _data: null };
        if (withCanvas) {
          c.getContext = () => ({
            fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
            moveTo() {}, lineTo() {}, fillText() {},
            set fillStyle(v) { c._fill = v; }, get fillStyle() { return c._fill; },
            set strokeStyle(v) { c._stroke = v; }, get strokeStyle() { return c._stroke; },
            set lineWidth(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
          });
          c.toDataURL = () => `data:image/png;base64,FAKE-${canvases.length}`;
        }
        canvases.push(c);
        return c;
      }
      return {};
    },
    querySelector(sel) { return links.find((l) => sel.includes('icon') && l.rel === 'icon') || null; },
  };
  return { doc, canvases, links };
}

const { updateFaviconBadge, __resetFaviconBadge, FAVICON_HREF } = await import('../src/lib/faviconBadge.js');

// 1) count>0 → href data-URL badge
{
  const { doc, links } = makeDoc();
  updateFaviconBadge(3, doc);
  const link = links[0];
  assert.match(link.getAttribute('href'), /^data:image\/png;base64,FAKE-/);
}

// 2) count>0 lalu 0 → KEMBALI ke favicon asli (bug fix utama)
{
  const { doc, links } = makeDoc();
  updateFaviconBadge(5, doc);
  updateFaviconBadge(0, doc);
  assert.equal(links[0].getAttribute('href'), FAVICON_HREF);
}

// 3) naik-turun count → href berubah tiap panggilan dgn angka beda (canvas baru)
{
  const { doc, links } = makeDoc();
  updateFaviconBadge(2, doc);
  const a = links[0].getAttribute('href');
  updateFaviconBadge(3, doc);
  const b = links[0].getAttribute('href');
  assert.notEqual(a, b, 'badge 2 vs 3 harus render data-URL berbeda');
}

// 4) reset eksplisit → favicon asli
{
  const { doc, links } = makeDoc();
  updateFaviconBadge(7, doc);
  __resetFaviconBadge(doc);
  assert.equal(links[0].getAttribute('href'), FAVICON_HREF);
}

// 5) tanpa canvas (browser lama/env tanpa 2d) → tetap set favicon asli, tanpa throw
{
  const { doc, links } = makeDoc({ withCanvas: false });
  updateFaviconBadge(4, doc);
  assert.equal(links[0].getAttribute('href'), FAVICON_HREF);
}

// 6) 9+ label: 10 dan 100 sama-sama menghasilkan canvas (bukan throw)
{
  const { doc, canvases } = makeDoc();
  updateFaviconBadge(10, doc);
  updateFaviconBadge(100, doc);
  assert.equal(canvases.length, 2);
}

console.log('✓ test-favicon-badge: 6 grup kasus lulus');
