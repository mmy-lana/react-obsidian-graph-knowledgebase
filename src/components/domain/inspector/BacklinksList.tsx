import { useMemo, useState } from 'react';
import { ArrowRight, FileWarning, Link2, Search } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { extractWikilinks } from '../../../services/markdown/parser';
import { escapeRegex } from '../../../utils/slug';
import { excerptAround } from '../../../utils/format';
import type { BacklinkItem, Note } from '../../../types/models';

export interface BacklinksListProps {
  /** Notes that link to the active note. */
  backlinks: BacklinkItem[];
  activeNote: Note | null;
  /** Every note in the vault, used to detect unlinked mentions. */
  allNotes: Note[];
  onNavigate: (noteId: string) => void;
  /** Converts an unlinked mention into a wikilink. */
  onConvertMention?: (sourceNoteId: string, targetTitle: string, mention: string) => void;
  className?: string;
  testId?: string;
}

interface MentionCandidate {
  sourceNoteId: string;
  sourceTitle: string;
  mention: string;
  excerpt: string;
}

/** Case-insensitive whole-word search for the active note's title. */
function findUnlinkedMentions(activeNote: Note, notes: Note[]): MentionCandidate[] {
  const title = activeNote.title.trim();
  if (title.length < 3) return [];

  const pattern = new RegExp(`(?<![\\w[])(${escapeRegex(title)})(?![\\w])`, 'gi');
  const candidates: MentionCandidate[] = [];

  for (const note of notes) {
    if (note.id === activeNote.id || note.isArchived) continue;
    if (extractWikilinks(note.content).some((link) => link.targetSlug === activeNote.slug)) continue;

    const match = pattern.exec(note.content);
    if (!match) continue;

    candidates.push({
      sourceNoteId: note.id,
      sourceTitle: note.title,
      mention: match[1],
      excerpt: excerptAround(note.content, match[1], 48),
    });
  }

  return candidates;
}

/**
 * Right-hand inspector listing inbound links with contextual snippets, plus
 * unlinked mentions that can be converted with one tap.
 */
export function BacklinksList({
  backlinks,
  activeNote,
  allNotes,
  onNavigate,
  onConvertMention,
  className = '',
  testId = 'backlinks-list',
}: BacklinksListProps) {
  const [showMentions, setShowMentions] = useState(true);

  const mentions = useMemo(
    () => (activeNote ? findUnlinkedMentions(activeNote, allNotes) : []),
    [activeNote, allNotes],
  );

  if (!activeNote) {
    return (
      <section
        className={['p-3 text-xs text-text-subtle', className].filter(Boolean).join(' ')}
        data-testid={testId}
      >
        Select a note to inspect its backlinks.
      </section>
    );
  }

  return (
    <section className={['flex flex-col gap-3', className].filter(Boolean).join(' ')} data-testid={testId}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">
          <Link2 className="h-3.5 w-3.5" />
          Backlinks
          <Badge tone="info" size="sm" testId={`${testId}-count`}>
            {backlinks.length}
          </Badge>
        </h3>
      </header>

      {backlinks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-text-subtle">
          Nothing links here yet. Type <code className="text-node-cyan">[[{activeNote.title}]]</code> in another
          note to create a backlink.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {backlinks.map((backlink) => (
            <li key={backlink.sourceNoteId}>
              <button
                type="button"
                onClick={() => onNavigate(backlink.sourceNoteId)}
                data-testid={`${testId}-item-${backlink.sourceNoteId}`}
                className="flex w-full flex-col gap-1 rounded-lg border border-border bg-canvas p-2 text-left transition-colors hover:border-node-cyan/50 hover:bg-elevated/50"
              >
                <span className="flex items-center gap-1 text-xs font-medium text-node-cyan">
                  <span className="truncate">{backlink.sourceTitle}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </span>
                <span className="line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                  {backlink.excerpt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {onConvertMention ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowMentions((value) => !value)}
            aria-expanded={showMentions}
            data-testid={`${testId}-mentions-toggle`}
            className="flex min-h-11 items-center justify-between rounded-md px-1 text-left text-xs font-semibold uppercase tracking-wider text-text-subtle hover:text-text-main md:min-h-0"
          >
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Unlinked mentions
              {mentions.length > 0 ? (
                <Badge tone="warning" size="sm">
                  {mentions.length}
                </Badge>
              ) : null}
            </span>
            <span aria-hidden="true">{showMentions ? '−' : '+'}</span>
          </button>

          {showMentions ? (
            mentions.length === 0 ? (
              <p className="px-1 text-[11px] text-text-subtle">No unlinked mentions of this title.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {mentions.map((candidate) => (
                  <li
                    key={`${candidate.sourceNoteId}-${candidate.mention}`}
                    className="rounded-lg border border-dashed border-border p-2"
                  >
                    <p className="text-[11px] text-text-muted">{candidate.excerpt}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-text-subtle">{candidate.sourceTitle}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        leadingIcon={<Link2 />}
                        onClick={() =>
                          onConvertMention(candidate.sourceNoteId, activeNote.title, candidate.mention)
                        }
                        testId={`${testId}-convert-${candidate.sourceNoteId}`}
                      >
                        Link
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      {backlinks.length === 0 && mentions.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-text-subtle">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-node-amber" />
          Some notes mention this title without linking to it.
        </p>
      ) : null}
    </section>
  );
}

export default BacklinksList;