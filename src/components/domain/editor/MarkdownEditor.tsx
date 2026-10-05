import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { WikilinkSuggestPopover } from '../../molecules/WikilinkSuggestPopover';
import { useWikilinkAutoComplete, type SuggestionMatch } from '../../../hooks/useWikilinkAutoComplete';
import { parseFrontmatter } from '../../../services/markdown/parser';
import { analyzeText } from '../../../utils/format';
import type { EditorMode } from '../../../types/models';
import type { EditorFormatAction } from './EditorToolbar';
import { MarkdownPreview } from './MarkdownPreview';
import type { Note } from '../../../types/models';

/** Imperative surface used by the toolbar to drive the textarea selection. */
export interface MarkdownEditorHandle {
  applyFormat: (action: EditorFormatAction) => void;
  focus: () => void;
  getContent: () => string;
}

export interface MarkdownEditorProps {
  /** Receives the imperative editor handle (formatting + focus). */
  editorRef?: React.Ref<MarkdownEditorHandle>;
  note: Note | null;
  /** Debounced persistence callback. */
  onChangeContent: (content: string) => void;
  mode: EditorMode;
  notes: Note[];
  onOpenLink?: (title: string) => void;
  onClickTag?: (tag: string) => void;
  onFormatApplied?: (content: string) => void;
  isSaving?: boolean;
  className?: string;
}

const LIST_PREFIX = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

interface FormatRule {
  wrap?: [string, string];
  prefix?: string;
  block?: boolean;
}

const FORMAT_RULES: Record<EditorFormatAction, FormatRule> = {
  bold: { wrap: ['**', '**'] },
  italic: { wrap: ['*', '*'] },
  heading: { prefix: '## ' },
  wikilink: { wrap: ['[[', ']]'] },
  task: { prefix: '- [ ] ' },
  bullet: { prefix: '- ' },
  code: { wrap: ['\n```\n', '\n```\n'] },
  quote: { prefix: '> ' },
};

/**
 * Markdown source editor with line numbers, list auto-continuation,
 * auto-indent, frontmatter awareness and `[[` wikilink autocomplete.
 */
export function MarkdownEditor({
  editorRef,
  note,
  onChangeContent,
  mode,
  notes,
  onOpenLink,
  onClickTag,
  onFormatApplied,
  isSaving = false,
  className = '',
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState(note?.content ?? '');
  const [isTouch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false,
  );

  const autocomplete = useWikilinkAutoComplete(notes);
  const { close: closeAutocomplete } = autocomplete;
  const lastSyncedRef = useRef<{ noteId: string | null; content: string }>({
    noteId: null,
    content: '',
  });

  /**
   * Synchronises the draft with the store without fighting the user's typing:
   *  - switching notes always loads the new content and closes autocomplete;
   *  - an external edit to the same note is adopted;
   *  - the editor's own write echoing back through the reactive query is ignored,
   *    so keystrokes are never reset and the wikilink popup stays open.
   */
  useEffect(() => {
    const noteId = note?.id ?? null;
    const incoming = note?.content ?? '';

    if (lastSyncedRef.current.noteId !== noteId) {
      lastSyncedRef.current = { noteId, content: incoming };
      setDraft(incoming);
      closeAutocomplete();
      return;
    }

    if (incoming !== lastSyncedRef.current.content && incoming !== draft) {
      lastSyncedRef.current.content = incoming;
      setDraft(incoming);
    }
  }, [note?.id, note?.content, draft, closeAutocomplete]);

  const commit = useCallback(
    (next: string) => {
      setDraft(next);
      onChangeContent(next);
    },
    [onChangeContent],
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const gutter = lineNumbersRef.current;
    if (!textarea || !gutter) return;
    gutter.scrollTop = textarea.scrollTop;
  }, []);

  /** Maps a character offset to viewport coordinates for the suggestion popup. */
  const coordinateAt = useCallback((offset: number): { top: number; left: number } => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    const before = textarea.value.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;

    const mirror = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    const properties = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'paddingTop',
      'paddingLeft',
      'borderTopWidth',
      'borderLeftWidth',
      'boxSizing',
      'tabSize',
    ] as const;

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.width = `${textarea.clientWidth}px`;
    for (const property of properties) mirror.style[property] = style[property];

    mirror.textContent = textarea.value.slice(0, lineStart);
    const marker = document.createElement('span');
    marker.textContent = textarea.value.slice(lineStart, offset) || '.';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    document.body.removeChild(mirror);

    return {
      top: textareaRect.top + markerRect.top - textarea.scrollTop,
      left: textareaRect.left + markerRect.left - textarea.scrollLeft + 4,
    };
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const caret = event.target.selectionStart;
    commit(value);
    autocomplete.handleEditorInput(value, caret, coordinateAt);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;

    if (autocomplete.isOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        autocomplete.setSelectedIndex(
          Math.min(autocomplete.selectedIndex + 1, autocomplete.suggestions.length - 1),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        autocomplete.setSelectedIndex(Math.max(autocomplete.selectedIndex - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const suggestion = autocomplete.suggestions[autocomplete.selectedIndex];
        if (suggestion) applySuggestion(suggestion);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        autocomplete.close();
        return;
      }
    }

    if (event.key === 'Enter') {
      const caret = textarea.selectionStart;
      const lineStart = textarea.value.lastIndexOf('\n', caret - 1) + 1;
      const currentLine = textarea.value.slice(lineStart, caret);
      const list = currentLine.match(LIST_PREFIX);

      if (list) {
        event.preventDefault();
        const [, indent, marker, checkbox] = list;
        const content = currentLine.slice(list[0].length);

        if (content.trim().length === 0) {
          // Empty list item: remove the prefix instead of adding another line.
          const next = `${textarea.value.slice(0, lineStart)}${textarea.value.slice(caret)}`;
          commit(next);
          setCaret(textarea, lineStart);
          return;
        }

        const nextMarker = /^\d/.test(marker)
          ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}`
          : marker;
        const nextCheckbox = checkbox ? '[ ] ' : '';
        const insert = `\n${indent}${nextMarker} ${nextCheckbox}`;
        const next = `${textarea.value.slice(0, caret)}${insert}${textarea.value.slice(caret)}`;
        commit(next);
        setCaret(textarea, caret + insert.length);
        return;
      }

      const indent = currentLine.match(/^\s*/)?.[0] ?? '';
      if (indent.length > 0) {
        event.preventDefault();
        const insert = `\n${indent}`;
        const next = `${textarea.value.slice(0, caret)}${insert}${textarea.value.slice(caret)}`;
        commit(next);
        setCaret(textarea, caret + insert.length);
        return;
      }
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const caret = textarea.selectionStart;
      const insert = '  ';
      const next = `${textarea.value.slice(0, caret)}${insert}${textarea.value.slice(caret)}`;
      commit(next);
      setCaret(textarea, caret + insert.length);
    }
  };

  const setCaret = (textarea: HTMLTextAreaElement, position: number) => {
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  };

  const applySuggestion = (suggestion: SuggestionMatch) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end } = autocomplete.triggerRange;
    const insert = `[[${suggestion.title}]]`;
    const next = `${draft.slice(0, start)}${insert}${draft.slice(end)}`;

    commit(next);
    autocomplete.close();

    const caret = start + insert.length;
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
    onFormatApplied?.(next);
  };

  const applyFormat = (action: EditorFormatAction) => {
    const textarea = textareaRef.current;
    const rule = FORMAT_RULES[action];
    if (!textarea || !rule) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.slice(start, end);
    let next = draft;
    let caret = start;

    if (rule.prefix) {
      const lineStart = draft.lastIndexOf('\n', start - 1) + 1;
      next = `${draft.slice(0, lineStart)}${rule.prefix}${draft.slice(lineStart)}`;
      caret = end + rule.prefix.length;
    } else if (rule.wrap) {
      const [open, close] = rule.wrap;
      next = `${draft.slice(0, start)}${open}${selected}${close}${draft.slice(end)}`;
      caret = start + open.length + selected.length + close.length;
    }

    commit(next);
    setCaret(textarea, caret);
    onFormatApplied?.(next);
  };

  useImperativeHandle(
    editorRef,
    () => ({
      applyFormat,
      focus: () => textareaRef.current?.focus(),
      getContent: () => draft,
    }),
    [applyFormat, draft],
  );

  const stats = analyzeText(draft);
  const { frontmatter } = parseFrontmatter(draft);
  const lineCount = draft.split('\n').length;

  if (!note) {
    return (
      <div
        className={['flex h-full items-center justify-center p-6 text-sm text-text-subtle', className]
          .filter(Boolean)
          .join(' ')}
        data-testid="markdown-editor-empty"
      >
        Select or create a note to start writing.
      </div>
    );
  }

  return (
    <div className={['relative flex h-full min-h-0 flex-col', className].filter(Boolean).join(' ')}>
      {mode !== 'preview' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
          <div
            ref={lineNumbersRef}
            aria-hidden="true"
            className="shrink-0 overflow-hidden border-r border-border bg-surface/60 px-2 py-3 text-right font-mono text-[11px] leading-6 text-text-subtle select-none"
            data-testid="editor-line-numbers"
          >
            {Array.from({ length: Math.max(lineCount, 1) }, (_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            spellCheck
            wrap="soft"
            aria-label={`Markdown source of ${note.title}`}
            placeholder="Write markdown… use [[ to link a note"
            data-testid="markdown-editor-textarea"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            className={[
              'min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-base leading-6 md:text-sm',
              'text-text-main placeholder:text-text-subtle focus:outline-none',
            ].join(' ')}
          />
        </div>
      ) : null}

      {mode !== 'source' ? (
        <div className={['min-h-0 flex-1 border-border', mode === 'live' ? 'border-t' : ''].join(' ')}>
          <MarkdownPreview
            content={draft}
            note={note}
            onOpenLink={onOpenLink}
            onClickTag={onClickTag}
          />
        </div>
      ) : null}

      <footer
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-surface px-3 py-1.5 text-[11px] tabular-nums text-text-subtle"
        data-testid="editor-status"
      >
        <span>{lineCount} lines</span>
        <span data-testid="editor-saving-state">{isSaving ? 'Saving…' : 'Saved'}</span>
        <span>{stats.words} words</span>
        <span>{stats.minutes} min read</span>
        {frontmatter.tags && frontmatter.tags.length > 0 ? (
          <span className="truncate">tags: {frontmatter.tags.join(', ')}</span>
        ) : null}
      </footer>

      <WikilinkSuggestPopover
        open={autocomplete.isOpen && mode !== 'preview'}
        suggestions={autocomplete.suggestions}
        selectedIndex={autocomplete.selectedIndex}
        cursorPosition={autocomplete.cursorPosition}
        query={autocomplete.query}
        isTouch={isTouch}
        onSelect={applySuggestion}
        onHighlight={autocomplete.setSelectedIndex}
        onClose={autocomplete.close}
      />

    </div>
  );
}

export default MarkdownEditor;