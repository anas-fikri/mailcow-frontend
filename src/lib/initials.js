/**
 * Extract initials from an address string like "John Doe <john@x.com>",
 * "john.doe@x.com", or a plain name.
 * - Display name before '<' wins (strips surrounding quotes).
 * - Otherwise falls back to the local part of the first email address.
 */
export function getInitials(value) {
  const text = String(value || '').trim();
  if (!text) return '?';

  // Display name is everything before '<', if present.
  let name = text.split('<')[0].trim().replace(/^["']|["']$/g, '');
  if (!name || name.startsWith('(') || name.includes('@')) {
    // Fall back to the local part of the first email address.
    const email = text.match(/[\w.+-]+@[\w.-]+/);
    if (email) name = email[0].split('@')[0].replace(/[._-]+/g, ' ');
  }
  if (!name || name.startsWith('(')) return '?';

  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
