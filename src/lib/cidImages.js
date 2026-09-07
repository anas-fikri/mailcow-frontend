/**
 * CID (Content-ID) inline image resolver — murni & testable di Node.
 *
 * Latihan dari laporan "signature gambar tidak terload": Outlook menulis
 * referensi CID dgn format khas `cid:image001.png@01DB3A12...` (nama file
 * + '@' + hex UUID), sementara resolver lama hanya mencocokkan
 * `cid:<nama-file>` PERSIS — referensi Outlook-style tidak pernah match,
 * gambar signature dari Outlook/Exchange tidak tampil.
 *
 * Strategi: ekstrak semua referensi `cid:...` dari HTML, lalu match DENGAN
 * TIGA kandidat per gambar inline (paling-spesifik dulu):
 *   1. Content-ID persis dgn angle-bracket (img.contentId / 'cid:<x>')
 *   2. Nama file persis (img.name)
 *   3. Nama file TANPA ekstensi — menangkap cid:image001.png@uuid
 *      (prefix sebelum '@' = nama file) DAN cid:image001 (tanpa ekstensi).
 * Referensi yang tidak punya gambar cocok dibiarkan apa adanya.
 */

/** Escaped string utk pemakaian di dalam RegExp. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kumpulkan semua referensi cid: dari atribut src dalam HTML.
 * @returns {string[]} daftar isi cid (tanpa prefix 'cid:', sudah decode)
 */
export function extractCidReferences(html) {
  if (!html) return [];
  const refs = [];
  const re = /\bsrc=["']cid:([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      refs.push(decodeURIComponent(m[1]));
    } catch {
      refs.push(m[1]);
    }
  }
  return refs;
}

/**
 * Bangun kandidat key utk satu gambar inline (urutan prioritas).
 * Semua lowercase — CID matching case-insensitive ala email client.
 */
function candidateKeys(img) {
  const keys = [];
  const cid = typeof img.contentId === 'string' ? img.contentId.trim() : '';
  if (cid) {
    keys.push(cid.toLowerCase());
    keys.push(cid.replace(/^cid:</i, '<').toLowerCase());
    keys.push(cid.replace(/^cid:</i, '').replace(/^<|>$/g, '').toLowerCase());
  }
  const name = typeof img.name === 'string' ? img.name.trim().toLowerCase() : '';
  if (name) {
    keys.push(name);
    const stem = name.replace(/\.[^.]+$/, '');
    if (stem) keys.push(stem);
  }
  return keys;
}

/**
 * Resolve semua referensi cid: pada HTML memakai daftar gambar inline.
 *
 * @param {string} html HTML mentah (belum sanitize)
 * @param {Array<{name?: string, contentId?: string, downloadURL: string}>} inlineImages
 * @param {function} toSafeUrl  fn(url, opts) => url aman SOGo (injected agar testable)
 * @param {object}  [safeUrlOpts] opsi utk toSafeUrl (base, allowExternal, ...)
 * @returns {string} html dgn src=cid:... terganti SOGo URL (atau utuh bila tak match)
 */
export function resolveCidReferences(html, inlineImages, toSafeUrl, safeUrlOpts) {
  if (!html || !Array.isArray(inlineImages) || inlineImages.length === 0) return html;

  // Map kandidat-key → SOGo download URL (spesifik menang; duplikat diabaikan).
  const map = new Map();
  for (const img of inlineImages) {
    if (!img?.downloadURL) continue;
    const url = toSafeUrl(img.downloadURL, safeUrlOpts);
    if (!url) continue;
    for (const key of candidateKeys(img)) {
      if (!map.has(key)) map.set(key, url);
    }
  }
  if (map.size === 0) return html;

  const refs = extractCidReferences(html);
  if (refs.length === 0) return html;

  let resolved = html;
  for (const ref of refs) {
    const refLower = ref.toLowerCase();
    // Kandidat ref: persis, tanpa angle bracket, dan prefix sebelum '@'
    // (menangkap cid:image001.png@01DB... → image001.png).
    const candidates = [
      refLower,
      refLower.replace(/^<|>$/g, ''),
      refLower.split('@')[0],
    ].filter(Boolean);
    let hit = null;
    for (const c of candidates) {
      if (map.has(c)) { hit = map.get(c); break; }
    }
    if (!hit) continue;

    // Replace SEMUA varian penulisan utk ref ini (quote ', ", dan angle-bracket).
    const variants = [
      new RegExp(`src="cid:${escapeRegex(ref)}"`, 'gi'),
      new RegExp(`src='cid:${escapeRegex(ref)}'`, 'gi'),
      new RegExp(`src="cid:<${escapeRegex(ref)}>"`, 'gi'),
      new RegExp(`src="cid:<${escapeRegex(ref)}"`, 'gi'),
    ];
    for (const re of variants) {
      resolved = resolved.replace(re, `src="${hit}"`);
    }
  }
  return resolved;
}
