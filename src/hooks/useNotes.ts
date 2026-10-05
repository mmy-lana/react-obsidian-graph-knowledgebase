import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLinkId, getDb } from '../services/db/schema';
import { extractTags, extractWikilinks, parseFrontmatter } from '../services/markdown/parser';
import { escapeRegex, slugify } from '../utils/slug';
import { genId } from '../utils/id';
import { toIsoDate } from '../utils/format';
import type {
  BacklinkItem,
  Folder,
  ID,
  Note,
  NoteLink,
  SearchResult,
} from '../types/models';

export interface CreateNoteInput {
  title?: string;
  content?: string;
  folderId?: ID | null;
}

export interface NotesApi {
  notes: Note[];
  folders: Folder[];
  links: NoteLink[];
  activeNote: Note | null;
  activeNoteId: ID | null;
  isReady: boolean;
  error: string | null;

  setActiveNoteId: (id: ID | null) => void;
  createNote: (title?: string, folderId?: ID | null) => Promise<Note>;
  updateNoteContent: (id: ID, content: string) => Promise<void>;
  renameNote: (id: ID, newTitle: string) => Promise<void>;
  deleteNote: (id: ID) => Promise<void>;
  togglePin: (id: ID) => Promise<void>;
  toggleArchive: (id: ID) => Promise<void>;
  moveNote: (id: ID, folderId: ID | null) => Promise<void>;
  updateFrontmatter: (id: ID, frontmatter: Note['frontmatter']) => Promise<void>;

  createFolder: (name: string, parentId?: ID | null) => Promise<Folder>;
  renameFolder: (id: ID, name: string) => Promise<void>;
  deleteFolder: (id: ID) => Promise<void>;

  getBacklinks: (noteId: ID | null) => BacklinkItem[];
  searchNotes: (query: string) => SearchResult[];
  tagCounts: Record<string, number>;
  linkCounts: Record<string, number>;
  backlinkCounts: Record<string, number>;
}

/** Appends `-2`, `-3`, ... until the slug is free. */
const uniqueSlug = async (title: string, excludeNoteId?: ID): Promise<string> => {
  const db = getDb();
  const base = slugify(title);

  for (let suffix = 1; suffix < 500; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await db.notes.where('slug').equals(candidate).first();
    if (!existing || existing.id === excludeNoteId) return candidate;
  }

  return `${base}-${genId().slice(0, 4)}`;
};

/** Re-indexes every link row whose target resolves to `slug`. */
const resolveLinksForSlug = async (db: ReturnType<typeof getDb>, slug: string): Promise<void> => {
  const target = await db.notes.where('slug').equals(slug).first();
  await db.links.where('targetSlug').equals(slug).modify({ targetNoteId: target ? target.id : null });
};

/**
 * Builds the persisted link index for one note from its raw markdown.
 * `batchPut` inside the caller's transaction keeps writes atomic.
 */
const indexLinksForNote = async (
  db: ReturnType<typeof getDb>,
  note: Note,
  existing: NoteLink[],
): Promise<void> => {
  const wikilinks = extractWikilinks(note.content);
  const slugTargets = new Set(wikilinks.map((link) => link.targetSlug));
  const stale = existing.filter((link) => !slugTargets.has(link.targetSlug));

  if (stale.length > 0) {
    await db.links.bulkDelete(stale.map((link) => link.id));
  }

  const bySlug = new Map(
    (await db.notes.filter((candidate) => candidate.id !== note.id).toArray()).map((candidate) => [
      candidate.slug,
      candidate.id,
    ]),
  );

  const rows: NoteLink[] = wikilinks.map((wikilink) => ({
    id: buildLinkId(note.id, wikilink.targetSlug),
    sourceNoteId: note.id,
    targetSlug: wikilink.targetSlug,
    targetNoteId: bySlug.get(wikilink.targetSlug) ?? null,
    alias: wikilink.alias ?? null,
    createdAt: note.createdAt,
  }));

  if (rows.length > 0) {
    await db.links.bulkPut(rows);
  }
};

/**
 * Reactive note/folder/link access layer.
 *
 * All writes go through the lazy `getDb()` singleton. Debounced editor updates
 * are guarded by a per-note write lock so a slow write can never land after a
 * newer one and resurrect stale content.
 */
export function useNotes(): NotesApi {
  const [activeNoteId, setActiveNoteId] = useState<ID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightWritesRef = useRef<Set<string>>(new Set());
  const pendingContentRef = useRef<Map<ID, string>>(new Map());

  const notes = useLiveQuery(() => getDb().notes.toArray(), [], [] as Note[]) ?? [];
  const folders = useLiveQuery(() => getDb().folders.toArray(), [], [] as Folder[]) ?? [];
  const links = useLiveQuery(() => getDb().links.toArray(), [], [] as NoteLink[]) ?? [];
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDb()
      .open()
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Database failed to open');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep a valid active note: fall back to the first available note.
  useEffect(() => {
    if (notes.length === 0) {
      setActiveNoteId(null);
      return;
    }
    if (activeNoteId && notes.some((note) => note.id === activeNoteId)) return;

    const pinned = notes.find((note) => note.isPinned);
    setActiveNoteId((pinned ?? notes[0]).id);
  }, [notes, activeNoteId]);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'Unexpected storage error');
  }, []);

  const createNote = useCallback(
    async (title = 'Untitled', folderId: ID | null = null): Promise<Note> => {
      try {
        const db = getDb();
        const now = Date.now();
        const trimmed = title.trim() || 'Untitled';
        const slug = await uniqueSlug(trimmed);
        const { frontmatter } = parseFrontmatter('');

        const note: Note = {
          id: genId(),
          slug,
          title: trimmed,
          content: '',
          folderId,
          frontmatter: {
            ...frontmatter,
            title: trimmed,
            created: toIsoDate(now),
            updated: toIsoDate(now),
          },
          createdAt: now,
          updatedAt: now,
          isPinned: false,
          isArchived: false,
        };

        await db.notes.add(note);
        setActiveNoteId(note.id);
        setError(null);
        return note;
      } catch (cause) {
        report(cause);
        throw cause;
      }
    },
    [report],
  );

  const updateNoteContent = useCallback(
    async (id: ID, content: string): Promise<void> => {
      const db = getDb();

      // Drop superseded payloads so only the latest keystroke state is stored.
      pendingContentRef.current.set(id, content);

      if (inFlightWritesRef.current.has(id)) return;
      inFlightWritesRef.current.add(id);

      try {
        while (pendingContentRef.current.has(id)) {
          const nextContent = pendingContentRef.current.get(id)!;
          pendingContentRef.current.delete(id);

          const note = await db.notes.get(id);
          if (!note || note.content === nextContent) continue;

          const now = Date.now();
          const updated: Note = { ...note, content: nextContent, updatedAt: now };

          await db.transaction('rw', [db.notes, db.links], async () => {
            await db.notes.put(updated);
            const existing = await db.links.where('sourceNoteId').equals(id).toArray();
            await indexLinksForNote(db, updated, existing);
          });

          await resolveLinksForSlug(db, updated.slug);
        }
        setError(null);
      } catch (cause) {
        report(cause);
      } finally {
        inFlightWritesRef.current.delete(id);
      }
    },
    [report],
  );

  const renameNote = useCallback(
    async (id: ID, newTitle: string): Promise<void> => {
      try {
        const db = getDb();
        const trimmed = newTitle.trim() || 'Untitled';

        await db.transaction('rw', [db.notes, db.links], async () => {
          const note = await db.notes.get(id);
          if (!note) return;

          const now = Date.now();
          const oldTitle = note.title;
          const newSlug = await uniqueSlug(trimmed, id);

          await db.notes.put({
            ...note,
            title: trimmed,
            slug: newSlug,
            updatedAt: now,
            frontmatter: {
              ...note.frontmatter,
              title: trimmed,
              updated: toIsoDate(now),
            },
          });

          const affected: Note[] = [];

          if (oldTitle !== trimmed) {
            // Alias capture includes the leading pipe, so concatenation is literal.
            const pattern = new RegExp(`\\[\\[${escapeRegex(oldTitle)}(\\|[^\\]]*)?\\]\\]`, 'g');
            const referencing = await db.notes.filter((candidate) => candidate.id !== id).toArray();

            for (const candidate of referencing) {
              const content = candidate.content;
              if (!content.includes(`[[${oldTitle}`)) continue;

              const nextContent = content.replace(
                pattern,
                (_, alias: string | undefined) => (alias ? `[[${trimmed}${alias}]]` : `[[${trimmed}]]`),
              );

              if (nextContent !== content) {
                affected.push({ ...candidate, content: nextContent, updatedAt: now });
              }
            }

            if (affected.length > 0) await db.notes.bulkPut(affected);
          }

          // Re-index links for the renamed note and for every note that referenced it.
          const renamed = await db.notes.get(id);
          if (renamed) {
            const renamedLinks = await db.links.where('sourceNoteId').equals(id).toArray();
            await indexLinksForNote(db, renamed, renamedLinks);
          }

          const affectedLinks = await db.links
            .where('sourceNoteId')
            .anyOf(affected.map((candidate) => candidate.id))
            .toArray()
            .catch(() => [] as NoteLink[]);

          for (const candidate of affected) {
            const candidateLinks = affectedLinks.filter((link) => link.sourceNoteId === candidate.id);
            await indexLinksForNote(db, candidate, candidateLinks);
          }

          // Target resolution changed for both slugs.
          await resolveLinksForSlug(db, newSlug);
          await resolveLinksForSlug(db, note.slug);
        });

        setError(null);
      } catch (cause) {
        report(cause);
        throw cause;
      }
    },
    [report],
  );

  const deleteNote = useCallback(
    async (id: ID): Promise<void> => {
      try {
        const db = getDb();

        await db.transaction('rw', [db.notes, db.links], async () => {
          const note = await db.notes.get(id);
          if (!note) return;

          await db.notes.delete(id);
          await db.links.where('sourceNoteId').equals(id).delete();
          await db.links.where('targetNoteId').equals(id).modify({ targetNoteId: null });
        });

        if (activeNoteId === id) setActiveNoteId(null);
        setError(null);
      } catch (cause) {
        report(cause);
        throw cause;
      }
    },
    [activeNoteId, report],
  );

  const togglePin = useCallback(
    async (id: ID): Promise<void> => {
      try {
        const db = getDb();
        const note = await db.notes.get(id);
        if (!note) return;
        await db.notes.put({ ...note, isPinned: !note.isPinned, updatedAt: Date.now() });
        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const toggleArchive = useCallback(
    async (id: ID): Promise<void> => {
      try {
        const db = getDb();
        const note = await db.notes.get(id);
        if (!note) return;
        await db.notes.put({ ...note, isArchived: !note.isArchived, updatedAt: Date.now() });
        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const moveNote = useCallback(
    async (id: ID, folderId: ID | null): Promise<void> => {
      try {
        await getDb().notes.update(id, { folderId, updatedAt: Date.now() });
        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const updateFrontmatter = useCallback(
    async (id: ID, frontmatter: Note['frontmatter']): Promise<void> => {
      try {
        const db = getDb();
        await db.notes.update(id, {
          frontmatter,
          updatedAt: Date.now(),
        });
        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const createFolder = useCallback(
    async (name: string, parentId: ID | null = null): Promise<Folder> => {
      try {
        const folder: Folder = {
          id: genId(),
          name: name.trim() || 'New folder',
          parentId,
          createdAt: Date.now(),
        };
        await getDb().folders.add(folder);
        setError(null);
        return folder;
      } catch (cause) {
        report(cause);
        throw cause;
      }
    },
    [report],
  );

  const renameFolder = useCallback(
    async (id: ID, name: string): Promise<void> => {
      try {
        await getDb().folders.update(id, { name: name.trim() || 'New folder' });
        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const deleteFolder = useCallback(
    async (id: ID): Promise<void> => {
      try {
        const db = getDb();

        await db.transaction('rw', [db.folders, db.notes], async () => {
          const descendants = await db.folders.filter((folder) => folder.parentId === id).toArray();
          const folderIds = [id, ...descendants.map((folder) => folder.id)];

          await db.notes.where('folderId').anyOf(folderIds).modify({ folderId: null });
          await db.folders.bulkDelete(folderIds);
        });

        setError(null);
      } catch (cause) {
        report(cause);
      }
    },
    [report],
  );

  const getBacklinks = useCallback(
    (noteId: ID | null): BacklinkItem[] => {
      if (!noteId) return [];

      const note = notes.find((candidate) => candidate.id === noteId);
      if (!note) return [];

      return links
        .filter((link) => link.targetNoteId === noteId)
        .map((link) => {
          const source = notes.find((candidate) => candidate.id === link.sourceNoteId);
          const match = source
            ? extractWikilinks(source.content).find((wikilink) => wikilink.targetSlug === note.slug)
            : undefined;
          const start = match ? Math.max(0, match.startIndex - 60) : 0;
          const end = match ? Math.min(source!.content.length, match.endIndex + 60) : 120;

          return {
            sourceNoteId: link.sourceNoteId,
            sourceTitle: source?.title ?? 'Unknown note',
            sourceSlug: source?.slug ?? '',
            excerpt:
              source === undefined
                ? ''
                : `${start > 0 ? '…' : ''}${source.content.slice(start, end).replace(/\s+/g, ' ').trim()}${
                    end < source.content.length ? '…' : ''
                  }`,
          };
        })
        .sort((a, b) => a.sourceTitle.localeCompare(b.sourceTitle));
    },
    [links, notes],
  );

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) {
      if (note.isArchived) continue;
      for (const tag of new Set([...(note.frontmatter.tags ?? []), ...extractTags(note.content)])) {
        const clean = tag.replace(/^#/, '').trim();
        if (clean.length === 0) continue;
        counts[clean] = (counts[clean] ?? 0) + 1;
      }
    }
    return counts;
  }, [notes]);

  const linkCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const link of links) counts[link.sourceNoteId] = (counts[link.sourceNoteId] ?? 0) + 1;
    return counts;
  }, [links]);

  const backlinkCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const link of links) {
      if (link.targetNoteId) counts[link.targetNoteId] = (counts[link.targetNoteId] ?? 0) + 1;
    }
    return counts;
  }, [links]);

  const searchNotes = useCallback(
    (query: string): SearchResult[] => {
      const term = query.trim().toLowerCase();
      if (!term) return [];

      const results: SearchResult[] = [];

      for (const note of notes) {
        if (note.isArchived) continue;

        const matches: SearchResult['matches'] = [];
        let score = 0;

        if (note.title.toLowerCase().includes(term)) {
          score += note.title.toLowerCase() === term ? 60 : 40;
          matches.push({ field: 'title', snippet: note.title });
        }

        const aliases = note.frontmatter.aliases ?? [];
        if (aliases.some((alias) => alias.toLowerCase().includes(term))) score += 25;

        const tags = note.frontmatter.tags ?? [];
        if (tags.some((tag) => tag.toLowerCase().includes(term))) {
          score += 20;
          matches.push({ field: 'tags', snippet: tags.join(', ') });
        }

        const contentIndex = note.content.toLowerCase().indexOf(term);
        if (contentIndex !== -1) {
          score += 10;
          const start = Math.max(0, contentIndex - 50);
          const end = Math.min(note.content.length, contentIndex + term.length + 50);
          matches.push({
            field: 'content',
            snippet: `${start > 0 ? '…' : ''}${note.content.slice(start, end).replace(/\s+/g, ' ').trim()}${
              end < note.content.length ? '…' : ''
            }`,
          });
        }

        if (score > 0) results.push({ note, matchScore: score, matches });
      }

      return results.sort((a, b) => b.matchScore - a.matchScore || a.note.title.localeCompare(b.note.title));
    },
    [notes],
  );

  return {
    notes,
    folders,
    links,
    activeNote,
    activeNoteId,
    isReady,
    error,
    setActiveNoteId,
    createNote,
    updateNoteContent,
    renameNote,
    deleteNote,
    togglePin,
    toggleArchive,
    moveNote,
    updateFrontmatter,
    createFolder,
    renameFolder,
    deleteFolder,
    getBacklinks,
    searchNotes,
    tagCounts,
    linkCounts,
    backlinkCounts,
  };
}

export default useNotes;