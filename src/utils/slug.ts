/**
 * URL / filename safe slug generation plus regex escaping helpers.
 *
 * Titles containing only non-Latin characters (CJK, Cyrillic, emoji, ...) have
 * no ASCII representation; those fall back to a short random identifier so the
 * note still receives a stable, unique, linkable slug.
 */
export const slugify = (text: string): string => {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  if (slug.length > 0) {
    return slug;
  }

  // Node.js test environment & non-Latin title fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
};

/** Escape every character with special meaning inside a `RegExp` source string. */
export const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Human readable label derived from a slug (`second-brain` -> `Second Brain`). */
export const slugToLabel = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');