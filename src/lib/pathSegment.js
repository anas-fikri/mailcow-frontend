/**
 * Validate a dynamic SOGo URL segment before interpolation.
 *
 * SOGo folder IDs may contain `%2F` for nested mailboxes; all other percent
 * escapes are rejected so a proxy cannot decode encoded traversal delimiters.
 *
 * REALITA PRODUKSI (2026-09-04): folder user mengandung SPASI & tanda baca —
 * "INBOX/Pak Eriawan", "Notes (This computer only)", "Team KAC 3 - Tuta",
 * "X. Spam". Whitelist lama (A-Za-z0-9@._%+~%-) menolaknya → setiap operasi
 * di folder tersebut melempar "Parameter folder tidak valid." Whitelist kini
 * mengikuti RFC 3986 pchar + spasi; proteksi tetap penuh:
 *   - karakter kontrol ditolak lebih dulu (eksplisit, defense-in-depth)
 *   - hanya %2F yang lolos saat allowEncodedSlash; escape lain ditolak
 *     (mencegah %2e%2e, %0a, dll didecode di belakang kita)
 *   - traversal (`..` sebagai segmen) dicek pada nilai TERDECODE
 */
export function pathSegment(value, name = 'path', { allowEncodedSlash = false } = {}) {
  const segment = String(value ?? '');
  if (!segment || segment.length > 512) {
    throw new Error(`Parameter ${name} tidak valid.`);
  }
  // Kontrol (raw) — apapun konteksnya tidak sah dalam segmen URL.
  if (/[\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`Parameter ${name} tidak valid.`);
  }
  // RFC 3986 pchar (unreserved + sub-delims + ':' '@') + SPASI + '%'
  // ('%' dioper ulang oleh aturan escape di bawah — hanya %2F yang sah).
  if (!/^[A-Za-z0-9@._~+!$&'()*+,;=:%\- ]+$/.test(segment)) {
    throw new Error(`Parameter ${name} tidak valid.`);
  }

  if (allowEncodedSlash) {
    if (/%(?!2f)/i.test(segment)) throw new Error(`Parameter ${name} tidak valid.`);
  } else if (segment.includes('%')) {
    throw new Error(`Parameter ${name} tidak valid.`);
  }

  const decoded = allowEncodedSlash ? segment.replace(/%2f/gi, '/') : segment;
  if (/(?:^|\/)\.\.?(?:\/|$)/.test(decoded) || /[\\?#\u0000-\u001f\u007f]/.test(decoded)) {
    throw new Error(`Parameter ${name} tidak valid.`);
  }
  return segment;
}
