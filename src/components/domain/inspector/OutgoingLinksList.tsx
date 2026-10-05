import { CircleDashed, ExternalLink, Link2 } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { extractWikilinks } from '../../../services/markdown/parser';
import type { Note, NoteLink } from '../../../types/models';

export interface OutgoingLinkGroup {
  targetTitle: string;
  targetSlug: string;
  alias: string | null;
  /** Present when the link resolves to an existing note. */
  targetNoteId: string | null;
}

export interface OutgoingLinksListProps {
  links: NoteLink[];
  activeNote: Note | null;
  /** Title lookup used for resolved targets. */
  notesById: Record<string, Note>;
  /** Called for resolved links (navigate) and for ghosts (create the note). */
  onNavigate?: (noteId: string) => void;
  onCreateFromGhost?: (title: string) => void;
  className?: string;
  testId?: string;
}

/**
 * Outbound links of the active note, partitioned into resolved targets and
 * ghost (unresolved) targets. Recomputes from raw markdown so links written
 * but not yet indexed are still shown.
 */
export function OutgoingLinksList({
  links,
  activeNote,
  notesById,
  onNavigate,
  onCreateFromGhost,
  className = '',
  testId = 'outgoing-links',
}: OutgoingLinksListProps) {
  const groups = new Map<string, OutgoingLinkGroup>();

  if (activeNote) {
    for (const wikilink of extractWikilinks(activeNote.content)) {
      const key = `${wikilink.targetSlug}::${wikilink.alias ?? ''}`;
      if (groups.has(key)) continue;

      const targetNoteId = links.find(
        (link) => link.sourceNoteId === activeNote.id && link.targetSlug === wikilink.targetSlug,
      )?.targetNoteId;

      groups.set(key, {
        targetTitle: wikilink.targetTitle,
        targetSlug: wikilink.targetSlug,
        alias: wikilink.alias ?? null,
        targetNoteId: targetNoteId ?? null,
      });
    }
  }

  const all = Array.from(groups.values());
  const resolved = all.filter((group) => group.targetNoteId !== null);
  const ghosts = all.filter((group) => group.targetNoteId === null);

  if (!activeNote) {
    return (
      <section
        className={['p-3 text-xs text-text-subtle', className].filter(Boolean).join(' ')}
        data-testid={testId}
      >
        Select a note to see its outgoing links.
      </section>
    );
  }

  const renderRow = (group: OutgoingLinkGroup, isGhost: boolean) => (
    <li key={`${group.targetSlug}-${group.alias ?? ''}`}>
      {isGhost ? (
        <button
          type="button"
          onClick={() => onCreateFromGhost?.(group.targetTitle)}
          data-testid={`${testId}-ghost-${group.targetSlug}`}
          className="flex min-h-11 w-full items-center gap-2 rounded-md border border-dashed border-node-rose/40 px-2 py-1.5 text-left transition-colors hover:bg-node-rose/10 md:min-h-0"
        >
          <CircleDashed className="h-3.5 w-3.5 shrink-0 text-node-rose" />
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {group.targetTitle}
            {group.alias ? <span className="text-text-subtle"> (as “{group.alias}”)</span> : null}
          </span>
          <span className="shrink-0 text-[10px] text-node-rose">Create</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => group.targetNoteId && onNavigate?.(group.targetNoteId)}
          data-testid={`${testId}-resolved-${group.targetSlug}`}
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-elevated md:min-h-0"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0 text-node-cyan" />
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {notesById[group.targetNoteId ?? '']?.title ?? group.targetTitle}
            {group.alias ? <span className="text-text-subtle"> (as “{group.alias}”)</span> : null}
          </span>
          <ExternalLink className="h-3 w-3 shrink-0 text-text-subtle" />
        </button>
      )}
    </li>
  );

  return (
    <section className={['flex flex-col gap-3', className].filter(Boolean).join(' ')} data-testid={testId}>
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">
          Outgoing
          <Badge tone="info" size="sm">
            {resolved.length}
          </Badge>
        </h3>
        {resolved.length === 0 ? (
          <p className="mt-1 px-1 text-[11px] text-text-subtle">No outgoing links yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col">{resolved.map((group) => renderRow(group, false))}</ul>
        )}
      </div>

      {ghosts.length > 0 ? (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">
            Unresolved
            <Badge tone="danger" size="sm" testId={`${testId}-unresolved-count`}>
              {ghosts.length}
            </Badge>
          </h3>
          <ul className="mt-1 flex flex-col">{ghosts.map((group) => renderRow(group, true))}</ul>
        </div>
      ) : null}
    </section>
  );
}

export default OutgoingLinksList;