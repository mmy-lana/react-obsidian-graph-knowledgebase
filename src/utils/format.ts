import type { Note } from '../types/models';

const WORDS_PER_MINUTE = 200;

/**
 * Human readable byte size using binary units (1 KB = 1024 B).
 */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  minutes: number;
}

/**
 * Count words/characters/paragraphs and estimate reading time.
 * Reading speed is fixed at 200 words per minute with a 1 minute floor.
 */
export const analyzeText = (content: string): TextStats => {
  const characters = content.length;
  const charactersNoSpaces = content.replace(/\s/g, '').length;
  const words = content.split(/\s+/).filter((word) => word.length > 0).length;
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim().length > 0).length;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return { words, characters, charactersNoSpaces, paragraphs, minutes };
};

/** Estimated reading time in whole minutes (minimum 1). */
export const readingTimeMinutes = (content: string): number => analyzeText(content).minutes;

/** Compact reading time label, e.g. `3 min read`. */
export const formatReadingTime = (content: string): string => {
  const { minutes } = analyzeText(content);
  return `${minutes} min read`;
};

/**
 * Absolute timestamp rendered in the user's locale.
 * @param timestamp epoch milliseconds
 * @param withTime include hours and minutes (default false)
 */
export const formatDate = (timestamp: number, withTime = false): string => {
  if (!Number.isFinite(timestamp)) return '—';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/** ISO-8601 string (YYYY-MM-DD) used inside YAML frontmatter. */
export const toIsoDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '1970-01-01';
  return date.toISOString().slice(0, 10);
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Relative time label such as `just now`, `5m ago`, `3d ago`.
 * @param now injectable clock reading for deterministic rendering/tests
 */
export const formatRelativeTime = (timestamp: number, now: number = Date.now()): string => {
  if (!Number.isFinite(timestamp)) return '—';

  const delta = now - timestamp;

  if (delta < 0) return formatDate(timestamp, true);
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d ago`;
  if (delta < 52 * WEEK) return `${Math.floor(delta / WEEK)}w ago`;

  return formatDate(timestamp);
};

/** Truncate on a word boundary and append an ellipsis when shortened. */
export const truncate = (text: string, maxLength: number, ellipsis = '…'): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const cut = normalized.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ellipsis}`;
};

/**
 * Extract a single-line excerpt centred on an occurrence of `needle`.
 *
 * @param fromIndex optional lower bound for the search, used when the caller
 *   already knows the exact match offset (for example after a regex scan).
 */
export const excerptAround = (
  content: string,
  needle: string,
  radius = 60,
  fromIndex = 0,
): string => {
  if (!needle) return truncate(content, radius * 2);

  const start = Math.max(0, fromIndex);
  const index = content.toLowerCase().indexOf(needle.toLowerCase(), start);
  if (index === -1) return truncate(content, radius * 2);

  const excerptStart = Math.max(0, index - radius);
  const excerptEnd = Math.min(content.length, index + needle.length + radius);
  const slice = content.slice(excerptStart, excerptEnd).replace(/\s+/g, ' ').trim();

  return `${excerptStart > 0 ? '…' : ''}${slice}${excerptEnd < content.length ? '…' : ''}`;
};

/** `1 note` / `4 notes` pluralisation helper. */
export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

/** Total UTF-8 byte size of note content, used by the export/import summary. */
export const noteSizeInBytes = (note: Note): number => {
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  if (encoder) return encoder.encode(note.content).length;
  return note.content.length;
};

/** Metadata chip values (words, reading time, size, modified) for one note. */
export const buildNoteMetadata = (
  note: Note,
  now: number = Date.now(),
): Array<{ label: string; value: string }> => {
  const { words, minutes } = analyzeText(note.content);

  return [
    { label: 'Words', value: String(words) },
    { label: 'Read', value: `${minutes} min` },
    { label: 'Size', value: formatBytes(noteSizeInBytes(note)) },
    { label: 'Modified', value: formatRelativeTime(note.updatedAt, now) },
  ];
};