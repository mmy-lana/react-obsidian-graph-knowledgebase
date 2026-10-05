import { slugify } from '../../utils/slug';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = escapeHtml;

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
    const title = target.trim();
    const label = (alias ?? target).trim();
    const href = `#/note/${encodeURIComponent(slugify(title))}`;

    return stash(
      `<a href="${escapeAttribute(href)}" class="kb-wikilink" data-wikilink="${escapeAttribute(title)}" role="link" tabindex="0">${escapeHtml(label)}</a>`,
    );
  });

  // Markdown images.
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt: string, src: string) =>
    stash(`<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" class="max-w-full rounded" />`),
  );

  // Markdown links (safe protocols only).
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    if (!/^(https?:|mailto:|#)/i.test(href)) return label;
    const external = /^https?:/i.test(href);
    return stash(
      `<a href="${escapeAttribute(href)}"${external ? ' target="_blank" rel="noreferrer noopener"' : ''}>${escapeHtml(label)}</a>`,
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
 */
export function renderMarkdown(markdown: string): string {
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
      html.push(`<blockquote>${renderMarkdown(buffer.join('\n'))}</blockquote>`);
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