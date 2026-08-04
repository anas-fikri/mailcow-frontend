/**
 * Validate a dynamic SOGo URL segment before interpolation.
 *
 * SOGo folder IDs may contain `%2F` for nested mailboxes; all other percent
 * escapes are rejected so a proxy cannot decode encoded traversal delimiters.
 */
export function pathSegment(value, name = 'path', { allowEncodedSlash = false } = {}) {
  const segment = String(value ?? '');
  if (!segment || segment.length > 512 || !/^[A-Za-z0-9@._%+~%-]+$/.test(segment)) {
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
