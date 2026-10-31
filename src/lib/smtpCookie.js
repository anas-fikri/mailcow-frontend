/**
 * SMTP session cookie helpers (httpOnly) — pure, Node-testable.
 *
 * Menggantikan smtpToken yang sebelumnya di-persist di localStorage. Token sesi
 * SMTP (UUID dari /api/auth/smtp) kini disimpan sebagai cookie httpOnly sehingga
 * XSS di halaman webmail TIDAK bisa membaca/mencurinya. Atribut keamanan:
 *
 *   - HttpOnly      : tidak dapat diakses JS (anti XSS theft)
 *   - SameSite=Strict : tidak dikirim pada request lintas-situs (anti CSRF)
 *   - Path=/api     : hanya dikirim untuk endpoint /api/* (memperkecil paparan)
 *   - Secure        : hanya dikirim via HTTPS
 *   - Max-Age       : selaras dengan TTL sesi server (SESSION_MAX_AGE_MS)
 */

export const SMTP_SESSION_COOKIE = 'smtp_session';

/**
 * Parse header `Cookie` menjadi object { name: value }.
 * Aman terhadap nilai ber-encoded / kosong / malformed — tidak throw.
 * @param {string} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const cookies = {};
  const value = typeof header === 'string' ? header : '';
  for (const part of value.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

/**
 * Bangun nilai Set-Cookie untuk sesi SMTP.
 * @param {string} token
 * @param {{ secure?: boolean, maxAgeSec?: number }} [opts]
 * @returns {string}
 */
export function buildSmtpSessionCookie(token, { secure = true, maxAgeSec = 28800 } = {}) {
  const attrs = [
    `${SMTP_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * Bangun nilai Set-Cookie untuk menghapus sesi SMTP (Max-Age=0).
 * @param {{ secure?: boolean }} [opts]
 * @returns {string}
 */
export function clearSmtpSessionCookie({ secure = true } = {}) {
  const attrs = [
    `${SMTP_SESSION_COOKIE}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    'Max-Age=0',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
