import Dexie, { type Table } from 'dexie';
import type { Note, Folder, NoteLink } from '../../types/models';

export class KnowledgeBaseDatabase extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  links!: Table<NoteLink, string>;

  constructor() {
    super('ObsidianKnowledgeBaseDB');
    this.version(1).stores({
      notes: 'id, slug, title, folderId, createdAt, updatedAt, isPinned, isArchived',
      folders: 'id, parentId, name, createdAt',
      links: 'id, sourceNoteId, targetSlug, targetNoteId',
    });
  }
}

let dbInstance: KnowledgeBaseDatabase | null = null;

/**
 * Lazy factory providing a single DB instance across SSR, test, and browser environments.
 * Dexie handles pre-open request queuing internally; manual open() calls and ready-state
 * guards must not be added here.
 */
export const getDb = (): KnowledgeBaseDatabase => {
  if (!dbInstance) {
    dbInstance = new KnowledgeBaseDatabase();
  }
  return dbInstance;
};

/** Test/utility escape hatch: drops the cached instance (next call re-opens). */
export const resetDbInstance = (): void => {
  dbInstance = null;
};

/** Stable primary keys for indexed link rows. */
export const buildLinkId = (sourceNoteId: string, targetSlug: string): string =>
  `${sourceNoteId}->${targetSlug}`;