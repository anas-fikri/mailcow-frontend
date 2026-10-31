const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Return a URL safe for user-controlled links, or an empty string.
 * Message resources may opt into SOGo-only paths with allowExternal=false.
 */
export function toSafeUrl(value, { base = '', allowExternal = true } = {}) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//')) return '';

  if (raw.startsWith('/')) {
    if (!allowExternal && !raw.startsWith('/SOGo/')) return '';
    if (!raw.startsWith('/SOGo/') || !base) return encodeURI(raw);
    try {
      const resolved = new URL(raw, base);
      return SAFE_PROTOCOLS.has(resolved.protocol) ? resolved.href : '';
    } catch {
      return '';
    }
  }

  if (!allowExternal) return '';
  try {
    const parsed = new URL(raw, 'https://invalid.local');
    if (parsed.origin === 'https://invalid.local') return '';
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}
