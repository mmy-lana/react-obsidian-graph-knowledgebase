import { useMemo } from 'react';
import { renderMarkdown } from '../../../services/markdown/renderer';
import { parseFrontmatter } from '../../../services/markdown/parser';
import type { Note } from '../../../types/models';

export interface MarkdownPreviewProps {
  /** Raw markdown including optional frontmatter. */
  content: string;
  note?: Note | null;
  onOpenLink?: (title: string) => void;
  onClickTag?: (tag: string) => void;
  className?: string;
  testId?: string;
}

/**
 * Read-only markdown renderer. Wikilinks and tags become interactive, and
 * clicks are handled by delegation instead of inline handlers so the rendered
 * HTML stays safe.
 */
export function MarkdownPreview({
  content,
  note,
  onOpenLink,
  onClickTag,
  className = '',
  testId = 'markdown-preview',
}: MarkdownPreviewProps) {
  const { html, body } = useMemo(() => {
    const parsed = parseFrontmatter(content);
    return {
      body: parsed.body,
      html: renderMarkdown(parsed.body),
    };
  }, [content]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const wikilink = target.closest<HTMLElement>('[data-wikilink]');
    if (wikilink) {
      event.preventDefault();
      onOpenLink?.(wikilink.dataset.wikilink ?? '');
      return;
    }

    const tag = target.closest<HTMLElement>('[data-tag]');
    if (tag) {
      event.preventDefault();
      onClickTag?.(tag.dataset.tag ?? '');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    const actionable = target.closest<HTMLElement>('[data-wikilink], [data-tag]');
    if (!actionable) return;

    event.preventDefault();
    if (actionable.dataset.wikilink !== undefined) onOpenLink?.(actionable.dataset.wikilink);
    else onClickTag?.(actionable.dataset.tag ?? '');
  };

  if (content.trim().length === 0) {
    return (
      <div
        className={['flex h-full items-center justify-center p-6 text-center text-sm text-text-subtle', className]
          .filter(Boolean)
          .join(' ')}
        data-testid={`${testId}-empty`}
      >
        <p>
          Nothing to preview yet.
          <br />
          Start typing in the editor — <code className="text-node-cyan">[[</code> links a note.
        </p>
      </div>
    );
  }

  return (
    <div
      className={['kb-prose h-full overflow-y-auto overscroll-contain p-4', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-note-slug={note?.slug}
      aria-label={`Markdown preview of ${note?.title ?? 'note'}, ${body.length} characters`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownPreview;