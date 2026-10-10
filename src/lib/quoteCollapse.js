// ─── Deteksi bagian kutipan di body HTML pesan (utk "Tampilkan kutipan") ─────
// Logika MURNI string/regex (tanpa DOM) — dipanggil SETELAH DOMPurify di
// MessageReader; hasilnya dua potongan HTML yang masing-masing dirender via
// jalur sanitasi yang sama (tidak pernah menyentuh string tak tepercaya).
//
// Pola yang dikenali (urutan prioritas = posisi paling awal di dokumen):
//   - <blockquote> (type="cite" / class quote → kuat; polos → hanya bila
//     setelahnya hampir tidak ada teks lagi, agar blockquote dekoratif
//     newsletter tidak ikut dilipat)
//   - <div class="gmail_quote"> / id="divRplyFwdMsg" (Outlook) /
//     class="yahoo_quoted" / "moz-cite-prefix" / "protonmail_quote"
//   - Marker teks: "On … wrote:", "Pada … menulis:", "Le … a écrit :",
//     "Am … schrieb …:", "-----Original Message-----", "-----Pesan Asli-----",
//     "---------- Forwarded message ---------", "---------- Pesan Diteruskan",
//     header Outlook "Dari: … Dikirim:" / "From: … Sent:"
//   - Baris kutipan teks polos "&gt; …" (text/plain yang dibungkus pre-wrap)

const BLOCK_TAG_RE = /<(blockquote|div|p|table)\b[^>]*>/gi;

const CONTAINER_MARKERS = [
  { kind: 'blockquote-cite', re: /<blockquote\b[^>]*(?:type\s*=\s*["']?cite|class\s*=\s*["'][^"']*(?:quote|cite))[^>]*>/i },
  { kind: 'gmail_quote', re: /<div\b[^>]*class\s*=\s*["'][^"']*gmail_quote[^"']*["'][^>]*>/i },
  { kind: 'outlook', re: /<div\b[^>]*id\s*=\s*["']?divRplyFwdMsg["']?[^>]*>/i },
  { kind: 'yahoo', re: /<div\b[^>]*class\s*=\s*["'][^"']*yahoo_quoted[^"']*["'][^>]*>/i },
  { kind: 'moz', re: /<div\b[^>]*class\s*=\s*["'][^"']*moz-cite-prefix[^"']*["'][^>]*>/i },
  { kind: 'proton', re: /<div\b[^>]*class\s*=\s*["'][^"']*protonmail_quote[^"']*["'][^>]*>/i },
];

// Marker TEKS — dicari di luar tag; cut point dimundurkan ke awal elemen
// blok yang membungkus marker (lihat backToBlockStart).
export const QUOTE_TEXT_MARKERS = [
  { kind: 'on-wrote', re: /(?:^|>|\n)\s*On\s[^<\n]{3,200}?wrote:/i },
  { kind: 'pada-menulis', re: /(?:^|>|\n)\s*Pada\s[^<\n]{3,200}?menulis:/i },
  { kind: 'le-ecrit', re: /(?:^|>|\n)\s*Le\s[^<\n]{3,200}?a\s+écrit\s*:/i },
  { kind: 'am-schrieb', re: /(?:^|>|\n)\s*Am\s[^<\n]{3,200}?schrieb[^<\n]{0,120}:/i },
  { kind: 'original-message', re: /-{3,}\s*(?:Original Message|Pesan Asli|Mensaje original|Message d'origine|Ursprüngliche Nachricht)\s*-{3,}/i },
  { kind: 'forwarded', re: /-{3,}\s*(?:Forwarded message|Pesan Diteruskan|Pesan yang diteruskan|Weitergeleitete Nachricht)\s*-{3,}/i },
  { kind: 'outlook-header', re: /(?:<b>|<strong>)?\s*(?:From|Dari)\s*:?\s*(?:<\/b>|<\/strong>)?\s*[^<\n]{1,200}<br\s*\/?>\s*(?:<b>|<strong>)?\s*(?:Sent|Dikirim|Date|Tanggal)\s*:?/i },
  { kind: 'plain-gt', re: /(?:^|\n|<br\s*\/?>)\s*&gt;\s?/ },
];

/** Teks polos (tag dibuang, entity umum di-decode seadanya) utk hitung isi. */
export function stripTags(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True bila posisi `idx` berada di dalam sebuah tag `<…>`. */
function insideTag(html, idx) {
  const lt = html.lastIndexOf('<', idx);
  if (lt < 0) return false;
  const gt = html.lastIndexOf('>', idx);
  return gt < lt;
}

/**
 * Mundurkan cut point ke awal elemen blok terdekat yang membungkus marker —
 * HANYA bila marker adalah isi pertama blok itu (tidak ada teks lain di
 * antaranya). Marker di tengah blok (text/plain pre-wrap: "Terima kasih.\n\n
 * -----Original Message-----") dipotong tepat di marker; tanpa aturan ini
 * cut mundur ke awal div → bagian utama kosong → tidak pernah dilipat.
 */
function backToBlockStart(html, idx) {
  let best = idx;
  BLOCK_TAG_RE.lastIndex = 0;
  let m;
  let last = -1;
  while ((m = BLOCK_TAG_RE.exec(html)) && m.index < idx) last = m.index;
  BLOCK_TAG_RE.lastIndex = 0;
  if (last >= 0) {
    const between = html.slice(last, idx);
    if (!/<\/(?:div|p|blockquote|table|td|tr|li)\s*>/i.test(between) && stripTags(between) === '') best = last;
  }
  return best;
}

/**
 * Cari posisi awal kutipan. @returns {{ index:number, kind:string }|null}
 */
export function findQuoteStart(html) {
  const src = String(html ?? '');
  if (!src) return null;
  let best = null;
  const consider = (index, kind) => {
    if (index < 0) return;
    if (!best || index < best.index) best = { index, kind };
  };

  for (const { kind, re } of CONTAINER_MARKERS) {
    const m = src.match(re);
    if (m) consider(m.index, kind);
  }

  // <blockquote> polos: terima hanya bila setelah </blockquote> terakhir
  // hampir tidak ada teks lagi (signature pendek masih boleh).
  const plainBq = src.search(/<blockquote\b/i);
  if (plainBq >= 0) {
    const lastClose = src.lastIndexOf('</blockquote>');
    const tail = lastClose >= 0 ? src.slice(lastClose + '</blockquote>'.length) : '';
    if (stripTags(tail).length <= 120) consider(plainBq, 'blockquote');
  }

  for (const { kind, re } of QUOTE_TEXT_MARKERS) {
    re.lastIndex = 0;
    const m = re.exec(src);
    if (!m) continue;
    // Posisi teks marker: lewati leading >/\n dari grup non-capture dan tag
    // pembuka (mis. <b> pada header Outlook) agar cek insideTag menguji
    // karakter teks, bukan tag.
    let idx = m.index;
    const end = m.index + m[0].length - 1;
    while (idx < end) {
      if (/[\s>]/.test(src[idx])) { idx++; continue; }
      if (src[idx] === '<') {
        const close = src.indexOf('>', idx);
        if (close < 0 || close > end) break;
        idx = close + 1;
        continue;
      }
      break;
    }
    if (insideTag(src, idx)) continue;
    consider(backToBlockStart(src, idx), kind);
  }

  return best;
}

/**
 * Pisahkan body HTML menjadi bagian utama + kutipan.
 * Tidak melipat bila: tidak ada marker, atau bagian utama hampir kosong
 * (pesan = kutipan seluruhnya, mis. forward tanpa komentar — Outlook pun
 * menampilkannya penuh), atau kutipan terlalu pendek utk layak dilipat.
 *
 * @returns {{ main:string, quote:string, kind:string|null }}
 */
export function splitQuotedHtml(html, { minMainChars = 1, minQuoteChars = 20 } = {}) {
  const src = String(html ?? '');
  const hit = findQuoteStart(src);
  if (!hit) return { main: src, quote: '', kind: null };
  const main = src.slice(0, hit.index);
  const quote = src.slice(hit.index);
  if (stripTags(main).length < minMainChars) return { main: src, quote: '', kind: null };
  if (stripTags(quote).length < minQuoteChars) return { main: src, quote: '', kind: null };
  return { main, quote, kind: hit.kind };
}
