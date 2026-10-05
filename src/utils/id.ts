/**
 * Identifier generation with layered fallbacks so the app keeps working in
 * Node test environments, insecure contexts, and browsers without
 * `crypto.randomUUID` (older Safari / non-secure origins).
 */
export const genId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

/** Short, URL friendly identifier useful for DOM ids and canvas keys. */
export const genShortId = (): string => genId().replace(/-/g, '').slice(0, 10);