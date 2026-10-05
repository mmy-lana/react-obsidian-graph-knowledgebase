import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDb } from '../services/db/schema';
import type { Note, NoteLink } from '../types/models';

export interface NoteLinksData {
  /** Every persisted link row (source → target slug). */
  allLinks: NoteLink[];
  /** Links emitted by one note. */
  outgoing: NoteLink[];
  /** Links pointing at one note (resolved targets only). */
  incoming: NoteLink[];
  /** Outgoing links whose target does not exist yet. */
  ghosts: NoteLink[];
  backlinkCount: number;
  isLoading: boolean;
}

/**
 * Reactive link queries backed by the indexed `links` table.
 * All reads go through the lazy `getDb()` singleton.
 */
export function useNoteLinks(activeNoteId: string | null): NoteLinksData {
  const allLinks = useLiveQuery(() => getDb().links.toArray(), [], [] as NoteLink[]) ?? [];

  return useMemo(() => {
    const outgoing = activeNoteId ? allLinks.filter((link) => link.sourceNoteId === activeNoteId) : [];
    const incoming = activeNoteId
      ? allLinks.filter((link) => link.targetNoteId === activeNoteId)
      : [];

    return {
      allLinks,
      outgoing,
      incoming,
      ghosts: outgoing.filter((link) => link.targetNoteId === null),
      backlinkCount: incoming.length,
      isLoading: false,
    };
  }, [allLinks, activeNoteId]);
}

/** Notes indexed by id, useful for resolving link targets without re-querying. */
export function useNotesById(notes: Note[]): Record<string, Note> {
  return useMemo(
    () => Object.fromEntries(notes.map((note) => [note.id, note])),
    [notes],
  );
}

export default useNoteLinks;