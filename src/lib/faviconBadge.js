/**
 * Favicon unread badge — dot merah + angka di ikon tab (pola Gmail).
 *
 * Murni & testable: fungsi menerima dokumen (default global document) — di
 * Node dipakai fake document/canvas stub. Ikon digambar via canvas (base
 * biru + amplop, identik dgn /webmail/favicon.svg) lalu overlay dot angka;
 * hasil data-URL dipasang ke link[rel="icon"].
 *
 * Kontrak:
 *  - updateFaviconBadge(count, doc): count > 0 → ikon berbadge (angka, "9+"
 *    bila ≥10); count 0 → favicon asli. Dipanggil tiap unseenCount berubah.
 *  - __resetFaviconBadge(doc): paksa kembali ke favicon asli.
 *  - Bila canvas 2d tak tersedia → no-op aman (ikon asli tetap terpasang).
 */

export const FAVICON_HREF = '/webmail/favicon.svg';

function getFaviconLink(doc) {
  let link = doc.querySelector('link[rel="icon"]');
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'icon';
    doc.head.appendChild(link);
  }
  return link;
}

function renderBadgeDataUrl(count, doc) {
  if (count <= 0) return null;
  const Ctor = doc.defaultView?.HTMLCanvasElement;
  if (typeof Ctor === 'undefined') return null;
  const canvas = doc.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base: kotak biru rounded + amplop putih (meniru favicon.svg asli)
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 22, 36, 26);
  ctx.beginPath();
  ctx.moveTo(16, 25);
  ctx.lineTo(32, 38);
  ctx.lineTo(48, 25);
  ctx.stroke();

  // Dot merah kanan-atas + angka
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(48, 14, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count >= 10 ? '9+' : String(count), 48, 15);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null; // mis. canvas ter-taint — jangan pecah halaman
  }
}

export function updateFaviconBadge(count, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return;
  const dataUrl = count > 0 ? renderBadgeDataUrl(count, d) : null;
  // count 0 / canvas tak tersedia → KEMBALIKAN favicon asli (bug fix: dulu
  // no-op sehingga badge merah menempel selamanya setelah unread habis).
  const href = dataUrl || FAVICON_HREF;
  const link = getFaviconLink(d);
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

export function __resetFaviconBadge(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return;
  getFaviconLink(d).setAttribute('href', FAVICON_HREF);
}
