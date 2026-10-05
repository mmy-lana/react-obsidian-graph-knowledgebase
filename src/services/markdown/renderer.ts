import { slugify } from '../../utils/slug';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Reverses {@link escapeHtml} for the exact entity set it produces.
 *
 * Inline constructs run against the already-escaped document, so values that
 * feed derived output (slugs, URLs, protocol checks) must be decoded first.
 * `&amp;` is decoded last so an escaped literal `&amp;lt;` is not re-decoded
 * into `<`.
 */
const decodeEntities = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const escapeAttribute = escapeHtml;

/** Image sources limited to inert schemes: http(s), data:image, fragment, path. */
const ALLOWED_IMAGE_SRC = /^(https?:|data:image\/|#|\/)/i;

/** Anchor targets limited to inert schemes: http(s), mailto, in-document. */
const ALLOWED_LINK_HREF = /^(https?:|mailto:|#)/i;

/**
 * Inline markdown: wikilinks, tags, bold, italic, code, images, links, strikethrough.
 *
 * Raw HTML in the source is escaped up front, so everything handled afterwards
 * operates on inert text and the only markup in the output is generated here.
 */
function renderInline(text: string): string {
  const placeholders: string[] = [];

  const stash = (html: string): string => {
    placeholders.push(html);
    return `\u0000${placeholders.length - 1}\u0000`;
  };

  const safe = escapeHtml(text);

  // Inline code first so its contents are never re-processed.
  let output = safe.replace(/`([^`]+)`/g, (_match, code: string) => stash(`<code>${code}</code>`));

  // Wikilinks: [[Target]] and [[Target|Alias]].
  output = output.replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
    // The document is escaped, so decode before deriving the slug and re-using
    // the fragments: `target`/`label` are already inert for attribute output.
    const title = decodeEntities(target).trim();
    const label = (alias ?? target).trim();
    const href = `#/note/${encodeURIComponent(slugify(title))}`;

    return stash(
      `<a href="${escapeAttribute(href)}" class="kb-wikilink" data-wikilink="${escapeAttribute(title)}" role="link" tabindex="0">${label}</a>`,
    );
  });

  // Markdown images. Only inert schemes are emitted: http(s), data:image,
  // document-relative fragments and paths. Anything else (javascript:, data:text,
  // vbscript:, ...) degrades to its alt text so a note can never inject script.
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt: string, src: string) => {
    const rawSrc = decodeEntities(src);
    if (!ALLOWED_IMAGE_SRC.test(rawSrc)) return alt;

    return stash(`<img src="${src}" alt="${alt}" loading="lazy" class="max-w-full rounded" />`);
  });

  // Markdown links (safe protocols only).
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    const rawHref = decodeEntities(href);
    if (!ALLOWED_LINK_HREF.test(rawHref)) return label;

    const external = /^https?:/i.test(rawHref);
    return stash(
      `<a href="${href}"${external ? ' target="_blank" rel="noreferrer noopener"' : ''}>${label}</a>`,
    );
  });

  // Tags: #tag, not part of a word, not inside a URL fragment.
  output = output.replace(/(^|[\s(])#([a-zA-Z0-9_\-/]+)/g, (_match, prefix: string, tag: string) => {
    const clean = tag.replace(/[-/_]+$/, '');
    if (!clean) return `${prefix}#${tag}`;
    return `${prefix}<button type="button" class="kb-tag" data-tag="${escapeAttribute(clean)}" role="button" tabindex="0">#${clean}</button>`;
  });

  output = output
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/ {2,}$/gm, '<br />');

  return output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => placeholders[Number(index)]);
}

const splitTableRow = (row: string): string[] =>
  row
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Maximum blockquote nesting before the remainder is rendered flat. */
const MAX_BLOCKQUOTE_DEPTH = 8;

/**
 * Converts markdown to HTML.
 *
 * Supported: ATX headings, fenced code blocks, blockquotes, ordered/unordered
 * lists, task lists, pipe tables, horizontal rules, paragraphs, and inline
 * formatting including `[[wikilinks]]` and `#tags`.
 *
 * Wikilinks and tags are emitted as `data-wikilink` / `data-tag` elements so
 * the preview can delegate interaction (navigation, filtering) from a single
 * container handler instead of inline scripts.
 *
 * @param depth internal recursion depth for nested blockquotes. Deeply nested
 *   input is flattened instead of recursing, which would otherwise overflow the
 *   call stack on hostile documents.
 */
export function renderMarkdown(markdown: string, depth = 0): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];

  let index = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code block.
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      closeList();
      const language = fence[1] ?? '';
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(
        `<pre><code${language ? ` class="language-${escapeAttribute(language)}"` : ''}>${escapeHtml(buffer.join('\n'))}</code></pre>`,
      );
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeList();
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      html.push(`<h${level} id="${escapeAttribute(id)}">${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      closeList();
      html.push('<hr />');
      index += 1;
      continue;
    }

    // Table.
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      closeList();
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim().length > 0) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      const head = headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('');
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      closeList();
      const buffer: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }

      const nested = buffer.join('\n');
      const rendered =
        depth >= MAX_BLOCKQUOTE_DEPTH
          ? `<p>${renderInline(nested)}</p>`
          : renderMarkdown(nested, depth + 1);
      html.push(`<blockquote>${rendered}</blockquote>`);
      continue;
    }

    // Task list item.
    const task = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      closeList();
      const checked = task[2].toLowerCase() === 'x';
      html.push(
        `<label class="kb-task"><input type="checkbox" disabled ${checked ? 'checked' : ''} /> <span${checked ? ' class="line-through opacity-60"' : ''}>${renderInline(task[3])}</span></label>`,
      );
      index += 1;
      continue;
    }

    // Unordered list.
    const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (unordered) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(unordered[2])}</li>`);
      index += 1;
      continue;
    }

    // Ordered list.
    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        html.push(`<ol start="${ordered[2]}">`);
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ordered[3])}</li>`);
      index += 1;
      continue;
    }

    // Paragraph.
    closeList();
    const buffer: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|\s*(---+|\*\*\*+|___+)\s*$)/.test(lines[index]) &&
      !(lines[index].includes('|') && /^\s*\|?[\s:|-]+\|/.test(lines[index + 1] ?? ''))
    ) {
      buffer.push(lines[index]);
      index += 1;
    }

    if (buffer.length > 0) {
      html.push(`<p>${renderInline(buffer.join(' '))}</p>`);
    } else {
      index += 1;
    }
  }

  closeList();
  return html.join('\n');
}

/** Text-only excerpt used by previews and link cards. */
export function renderMarkdownExcerpt(markdown: string, maxLength = 180): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}