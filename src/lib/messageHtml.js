// ─── Deteksi HTML di dalam pesan text/plain ──────────────────────────────────
// Logika murni (tanpa DOM) agar bisa diuji oleh Node tanpa transpile JSX.

// Pola tag HTML umum — dipakai utk mendeteksi pesan text/plain yang berisi
// markup (mis. bounce mail "Mail delivery failed" dari SOGo): tampilkan
// sebagai HTML yang di-sanitize, bukan sumber mentah yang di-escape.
export const HTML_IN_PLAIN_RE = /<(?:div|p|br|table|tr|td|th|ul|ol|li|h[1-6]|a|span|font|b|strong|i|em|u|center|img|blockquote|pre|code|html|body|head|title)[\s>]/i;

/**
 * Periksa apakah konten text/plain berisi markup HTML yang perlu dirender
 * sebagai HTML (bukan di-escape). Heuristik tag spesifik mencegah salah-render
 * teks biasa yang hanya memakai `<`/`>` (kode, perbandingan, a < b).
 */
export function looksLikeHtmlInPlainText(content) {
  if (!content) return false;
  return HTML_IN_PLAIN_RE.test(content);
}
