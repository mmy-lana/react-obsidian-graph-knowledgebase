import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Badge } from '../../ui/Badge';
import { FileText, Link2 } from 'lucide-react';
import type { Note } from '../../../types/models';

export interface QuickSwitcherModalProps {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  activeNoteId: string | null;
  onSelect: (noteId: string) => void;
  /** When provided, a query with no note match offers note creation. */
  onCreateNote?: (title: string) => void;
  testId?: string;
}

interface Match {
  note: Note;
  score: number;
  matchedAlias: string | null;
}

function scoreNote(note: Note, term: string): Match | null {
  const title = note.title.toLowerCase();
  const aliases = note.frontmatter.aliases ?? [];

  if (title === term) return { note, score: 1000, matchedAlias: null };
  if (title.startsWith(term)) return { note, score: 800 - title.length, matchedAlias: null };
  if (title.includes(term)) return { note, score: 600 - title.length, matchedAlias: null };

  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase();
    if (normalizedAlias === term) return { note, score: 900, matchedAlias: alias };
    if (normalizedAlias.startsWith(term)) return { note, score: 700, matchedAlias: alias };
  }

  const slug = note.slug.toLowerCase();
  if (slug.includes(term)) return { note, score: 400 - slug.length, matchedAlias: null };

  return null;
}

/**
 * Quick switcher (Cmd/Ctrl+O): real-time search across note titles and
 * frontmatter aliases, with optional "create note" affordance.
 */
export function QuickSwitcherModal({
  open,
  onClose,
  notes,
  activeNoteId,
  onSelect,
  onCreateNote,
  testId = 'quick-switcher',
}: QuickSwitcherModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const matches = useMemo<Match[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return notes
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map((note) => ({ note, score: 0, matchedAlias: null }));
    }

    return notes
      .map((note) => scoreNote(note, term))
      .filter((match): match is Match => match !== null)
      .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
      .slice(0, 8);
  }, [notes, query]);

  const showCreate = onCreateNote !== undefined && query.trim().length > 0;
  const rowCount = matches.length + (showCreate ? 1 : 0);
  const clampedIndex = Math.min(selectedIndex, Math.max(rowCount - 1, 0));

  const selectAt = (index: number) => {
    if (index < matches.length) {
      onSelect(matches[index].note.id);
      onClose();
      return;
    }
    if (showCreate && index === matches.length) {
      onCreateNote?.(query.trim());
      onClose();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (rowCount === 0 ? 0 : (index + 1) % rowCount));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (rowCount === 0 ? 0 : (index - 1 + rowCount) % rowCount));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectAt(clampedIndex);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick switcher"
      description="Jump to a note by title or alias"
      variant="bottom-sheet"
      size="lg"
      testId={testId}
      className="sm:mt-0"
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${testId}-listbox`}
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          autoFocus
          data-autofocus
          data-testid={`${testId}-input`}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onKeyDown}
          className={[
            'min-h-11 w-full rounded-lg border border-border bg-canvas px-3 text-base md:text-sm',
            'text-text-main placeholder:text-text-subtle focus:border-node-cyan/60',
            'focus:outline-none focus:ring-1 focus:ring-node-cyan',
          ].join(' ')}
        />

        {matches.length === 0 && !showCreate ? (
          <p className="px-2 py-8 text-center text-sm text-text-subtle" data-testid={`${testId}-empty`}>
            No notes match “{query}”.
          </p>
        ) : (
          <ul
            id={`${testId}-listbox`}
            role="listbox"
            aria-label="Matching notes"
            data-testid={`${testId}-list`}
            className="max-h-[min(50vh,22rem)] overflow-y-auto"
          >
            {matches.map((match, index) => (
              <li key={match.note.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === clampedIndex}
                  data-testid={`${testId}-option-${match.note.id}`}
                  onPointerEnter={() => setSelectedIndex(index)}
                  onClick={() => selectAt(index)}
                  className={[
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm md:min-h-0',
                    index === clampedIndex ? 'bg-node-cyan/15 text-text-main' : 'text-text-muted hover:bg-elevated',
                  ].join(' ')}
                >
                  <FileText className="h-4 w-4 shrink-0 text-text-subtle" />
                  <span className="min-w-0 flex-1 truncate">{match.note.title}</span>

                  {match.note.id === activeNoteId ? (
                    <Badge tone="info" size="sm">
                      Open
                    </Badge>
                  ) : null}

                  {match.matchedAlias ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-subtle">
                      <Link2 className="h-3 w-3" />
                      {match.matchedAlias}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}

            {showCreate ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={matches.length === clampedIndex}
                  data-testid={`${testId}-create`}
                  onPointerEnter={() => setSelectedIndex(matches.length)}
                  onClick={() => selectAt(matches.length)}
                  className={[
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm md:min-h-0',
                    matches.length === clampedIndex
                      ? 'bg-node-cyan/15 text-text-main'
                      : 'text-text-muted hover:bg-elevated',
                  ].join(' ')}
                >
                  Create note “{query.trim()}”
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default QuickSwitcherModal;