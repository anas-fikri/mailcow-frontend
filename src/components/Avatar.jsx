import React from 'react';
import { AVATAR_COLORS } from '../lib/constants';

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-lg',
};

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

export default function Avatar({ name, email, size = 'md', className = '', title }) {
  const initials = getInitials(name || email);
  const color = AVATAR_COLORS[(initials.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <div
      title={title ?? (name || email) || undefined}
      className={`${SIZES[size] || SIZES.md} ${color} rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
    >
      {initials}
    </div>
  );
}
