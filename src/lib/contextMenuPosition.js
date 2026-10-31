// Penempatan menu konteks / popover di viewport — murni (tanpa DOM) supaya
// bisa diuji di Node. Menu dibuka di posisi kursor; bila melewati tepi
// viewport, dibalik ke sisi lain (flip) lalu dijepit (clamp) dgn margin.

/**
 * @param {object} o
 *   x, y               : titik jangkar (posisi kursor), px
 *   width, height      : ukuran menu, px
 *   viewportWidth/Height
 *   margin             : jarak minimal ke tepi (default 8)
 * @returns {{ left:number, top:number, flippedX:boolean, flippedY:boolean }}
 */
export function clampMenuPosition({ x = 0, y = 0, width = 0, height = 0, viewportWidth = 0, viewportHeight = 0, margin = 8 }) {
  const vw = Math.max(0, Number(viewportWidth) || 0);
  const vh = Math.max(0, Number(viewportHeight) || 0);
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const m = Math.max(0, Number(margin) || 0);

  let left = Number(x) || 0;
  let top = Number(y) || 0;
  let flippedX = false;
  let flippedY = false;

  // Flip: kalau tidak muat di kanan/bawah, buka ke kiri/atas dari titik jangkar.
  if (vw > 0 && left + w + m > vw && left - w >= m) { left = left - w; flippedX = true; }
  if (vh > 0 && top + h + m > vh && top - h >= m) { top = top - h; flippedY = true; }

  // Clamp: tetap di dalam viewport (prioritas sisi kiri/atas terlihat).
  if (vw > 0) left = Math.min(left, Math.max(m, vw - w - m));
  if (vh > 0) top = Math.min(top, Math.max(m, vh - h - m));
  left = Math.max(m, left);
  top = Math.max(m, top);

  return { left: Math.round(left), top: Math.round(top), flippedX, flippedY };
}

/**
 * Posisi submenu relatif terhadap item induk: default di KANAN item (sejajar
 * atas), flip ke KIRI bila tidak muat, lalu clamp vertikal.
 * @param {object} parentRect  { left, top, width, height } item induk (viewport px)
 * @param {object} size        { width, height } submenu
 * @param {object} viewport    { width, height }
 */
export function submenuPosition(parentRect, size, viewport, margin = 8) {
  const pr = parentRect || { left: 0, top: 0, width: 0, height: 0 };
  const sw = Math.max(0, Number(size?.width) || 0);
  const sh = Math.max(0, Number(size?.height) || 0);
  const vw = Math.max(0, Number(viewport?.width) || 0);
  const vh = Math.max(0, Number(viewport?.height) || 0);

  let left = pr.left + pr.width - 2; // overlap tipis supaya kursor tidak "jatuh"
  let flippedX = false;
  if (vw > 0 && left + sw + margin > vw) {
    left = pr.left - sw + 2;
    flippedX = true;
  }
  let top = pr.top - 4;
  if (vh > 0) top = Math.min(top, Math.max(margin, vh - sh - margin));
  left = Math.max(margin, left);
  top = Math.max(margin, top);
  return { left: Math.round(left), top: Math.round(top), flippedX, flippedY: false };
}

/**
 * Posisi popover di tengah viewport (dipakai saat picker dibuka dari keyboard,
 * tanpa titik kursor).
 */
export function centerPosition(size, viewport, margin = 8) {
  const sw = Math.max(0, Number(size?.width) || 0);
  const sh = Math.max(0, Number(size?.height) || 0);
  const vw = Math.max(0, Number(viewport?.width) || 0);
  const vh = Math.max(0, Number(viewport?.height) || 0);
  return {
    left: Math.max(margin, Math.round((vw - sw) / 2)),
    top: Math.max(margin, Math.round(Math.min(vh * 0.2, Math.max(margin, (vh - sh) / 2)))),
    flippedX: false,
    flippedY: false,
  };
}

/**
 * Navigasi indeks item menu dgn keyboard (melewati separator/disabled,
 * wrap-around). items: array { separator?:bool, disabled?:bool }.
 * @param {number} current  indeks sekarang (-1 = belum ada)
 * @param {1|-1|'home'|'end'} step
 */
export function nextMenuIndex(items, current, step) {
  const list = Array.isArray(items) ? items : [];
  const enabled = (i) => list[i] && !list[i].separator && !list[i].disabled;
  const n = list.length;
  if (n === 0) return -1;
  if (step === 'home') { for (let i = 0; i < n; i++) if (enabled(i)) return i; return -1; }
  if (step === 'end') { for (let i = n - 1; i >= 0; i--) if (enabled(i)) return i; return -1; }
  const dir = step < 0 ? -1 : 1;
  let i = current;
  for (let k = 0; k < n; k++) {
    i = i === -1 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
    if (enabled(i)) return i;
  }
  return -1;
}
