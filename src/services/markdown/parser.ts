import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import type { WikiLink, Frontmatter } from '../../types/models';
import { slugify } from '../../utils/slug';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Collect every `[[Target]]` / `[[Target|Alias]]` occurrence in document order.
 * The regex is instantiated per call so no `lastIndex` state leaks between runs.
 */
export function extractWikilinks(content: string): WikiLink[] {
  const wikilinkRegex = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = wikilinkRegex.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    const rawAlias = match[2]?.trim();
    links.push({
      raw: match[0],
      targetTitle: rawTarget,
      targetSlug: slugify(rawTarget),
      alias: rawAlias || undefined,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return links;
}

/** Collect inline `#tags` (supports nesting with `/` and `-`). */
export function extractTags(content: string): string[] {
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-/]+)(?=\s|$|[.,;:!?])/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    // Trailing/leading separators are punctuation in prose, not part of the tag.
    const tag = match[1].replace(/^[-/_]+/, '').replace(/[-/_]+$/, '');
    if (tag.length > 0) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

/**
 * Split raw document text into YAML frontmatter plus markdown body.
 * Malformed YAML degrades to an empty frontmatter block instead of throwing.
 */
export function parseFrontmatter(rawContent: string): { frontmatter: Frontmatter; body: string } {
  const match = FRONTMATTER_REGEX.exec(rawContent);
  if (!match) {
    return { frontmatter: {}, body: rawContent };
  }

  const rawYaml = match[1];
  const body = rawContent.slice(match[0].length);
  let parsed: unknown = {};

  try {
    parsed = loadYaml(rawYaml) || {};
  } catch {
    parsed = {};
  }

  const rawObj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const frontmatter: Frontmatter = {};

  if (typeof rawObj.title === 'string') frontmatter.title = rawObj.title;
  if (typeof rawObj.created === 'string') frontmatter.created = rawObj.created;
  if (typeof rawObj.updated === 'string') frontmatter.updated = rawObj.updated;

  if (Array.isArray(rawObj.tags)) {
    frontmatter.tags = rawObj.tags.map(String);
  } else if (typeof rawObj.tags === 'string') {
    frontmatter.tags = [rawObj.tags];
  }

  if (Array.isArray(rawObj.aliases)) {
    frontmatter.aliases = rawObj.aliases.map(String);
  } else if (typeof rawObj.aliases === 'string') {
    frontmatter.aliases = [rawObj.aliases];
  }

  return { frontmatter, body };
}

/** Serialise a frontmatter object back into a YAML document (including fences). */
export function stringifyFrontmatter(frontmatter: Frontmatter, body: string): string {
  const payload: Record<string, unknown> = {};
  if (frontmatter.title) payload.title = frontmatter.title;
  if (frontmatter.aliases?.length) payload.aliases = frontmatter.aliases;
  if (frontmatter.tags?.length) payload.tags = frontmatter.tags;
  if (frontmatter.created) payload.created = frontmatter.created;
  if (frontmatter.updated) payload.updated = frontmatter.updated;

  if (Object.keys(payload).length === 0) {
    return body;
  }

  const yamlText = dumpYaml(payload, { lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${yamlText}\n---\n${body}`;
}