import { getDb } from '../db/schema';
import { extractWikilinks, parseFrontmatter } from '../markdown/parser';
import { slugify } from '../../utils/slug';
import { genId } from '../../utils/id';
import { toIsoDate } from '../../utils/format';
import type { Folder, Note, NoteLink } from '../../types/models';

/** Portable snapshot of the vault, used for backups. */
export interface VaultBackup {
  format: 'obsidian-graph-backup';
  version: 1;
  exportedAt: string;
  notes: Note[];
  folders: Folder[];
}

/** One parsed markdown file ready to be written to IndexedDB. */
export interface ImportedNote {
  title: string;
  content: string;
  folderPath: string | null;
}

export interface ImportSummary {
  imported: number;
  updated: number;
  folders: number;
  notes: Note[];
}

/** Folders created/ensured for a slash separated path. */
const ensureFolderPath = async (
  path: string,
  db: ReturnType<typeof getDb> = getDb(),
): Promise<string | null> => {
  const segments = path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;

  const existing = await db.folders.toArray();
  let parentId: string | null = null;

  for (const segment of segments) {
    const found = existing.find((folder) => folder.parentId === parentId && folder.name === segment);
    if (found) {
      parentId = found.id;
      continue;
    }

    const folder: Folder = { id: genId(), name: segment, parentId, createdAt: Date.now() };
    await db.folders.add(folder);
    existing.push(folder);
    parentId = folder.id;
  }

  return parentId;
};

/**
 * Rebuilds the whole link index from note content.
 *
 * Deliberately free of its own transaction so callers can compose it inside a
 * wider write transaction; every statement uses plain IndexedDB operations.
 */
const reindexAllLinksCore = async (db: ReturnType<typeof getDb>): Promise<void> => {
  const notes = await db.notes.toArray();
  const bySlug = new Map(notes.map((note) => [note.slug, note.id]));
  const links: NoteLink[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    for (const wikilink of extractWikilinks(note.content)) {
      const id = `${note.id}->${wikilink.targetSlug}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const resolved = bySlug.get(wikilink.targetSlug);
      links.push({
        id,
        sourceNoteId: note.id,
        targetSlug: wikilink.targetSlug,
        // A note never resolves as its own backlink.
        targetNoteId: resolved !== undefined && resolved !== note.id ? resolved : null,
        alias: wikilink.alias ?? null,
        createdAt: note.createdAt,
      });
    }
  }

  await db.links.clear();
  if (links.length > 0) await db.links.bulkPut(links);
};

const reindexAllLinks = async (): Promise<void> => {
  const db = getDb();
  await db.transaction('rw', [db.notes, db.folders, db.links], async () => {
    await reindexAllLinksCore(db);
  });
};

/** Serialises the whole vault for download. */
export async function exportVault(): Promise<VaultBackup> {
  const db = getDb();
  const [notes, folders] = await Promise.all([db.notes.toArray(), db.folders.toArray()]);

  return {
    format: 'obsidian-graph-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    folders,
  };
}

/** Serialises one note back to a standalone markdown file (frontmatter included). */
export function noteToMarkdown(note: Note): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${note.title}`);
  if (note.frontmatter.aliases?.length) lines.push(`aliases: [${note.frontmatter.aliases.join(', ')}]`);
  if (note.frontmatter.tags?.length) lines.push(`tags: [${note.frontmatter.tags.join(', ')}]`);
  lines.push(`created: ${note.frontmatter.created ?? toIsoDate(note.createdAt)}`);
  lines.push(`updated: ${note.frontmatter.updated ?? toIsoDate(note.updatedAt)}`);
  lines.push('---');
  lines.push('');
  lines.push(note.content);
  return lines.join('\n');
}

/** Triggers a browser download for the given text payload. */
export function downloadTextFile(filename: string, contents: string, mimeType = 'text/plain'): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Exports the vault as a downloadable JSON backup. */
export async function downloadVaultBackup(): Promise<VaultBackup> {
  const backup = await exportVault();
  downloadTextFile(
    `knowledge-base-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  );
  return backup;
}

/** Delay between consecutive downloads so browsers do not treat a batch as spam. */
const DOWNLOAD_PACE_MS = 180;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exports every note as an individual markdown file (one download per note).
 *
 * Downloads are paced: firing dozens of clicks in the same task makes browsers
 * block everything but the first one, so each file is released on its own tick.
 */
export async function downloadMarkdownFiles(
  folderNamesById: Record<string, string>,
  options: { paceMs?: number; onProgress?: (completed: number, total: number) => void } = {},
): Promise<number> {
  const db = getDb();
  const notes = await db.notes.toArray();
  const paceMs = options.paceMs ?? DOWNLOAD_PACE_MS;

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const folder = note.folderId ? folderNamesById[note.folderId] : undefined;
    const safeName = `${note.slug || slugify(note.title)}.md`;

    downloadTextFile(folder ? `${folder}/${safeName}` : safeName, noteToMarkdown(note), 'text/markdown');
    options.onProgress?.(index + 1, notes.length);

    if (index < notes.length - 1 && paceMs > 0) {
      await wait(paceMs);
    }
  }

  return notes.length;
}

/** Parses a markdown file (plus optional folder path) into an importable note. */
export function parseMarkdownFile(filename: string, raw: string): ImportedNote {
  const { frontmatter, body } = parseFrontmatter(raw);
  const segments = filename.split('/').filter(Boolean);
  const baseName = segments.length > 0 ? segments[segments.length - 1] : 'Untitled';
  const title =
    frontmatter.title ?? (frontmatter.aliases?.[0] ?? baseName.replace(/\.md$/i, '').replace(/[-_]+/g, ' '));

  return {
    title,
    // Files written by this app start with a blank line after the fence.
    content: body.replace(/^\n+/, '').trimEnd(),
    folderPath: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
  };
}

/**
 * Imports parsed notes, creating folders and matching existing notes by slug.
 *
 * Folder resolution, note writes and the link re-index all run inside a single
 * read-write transaction: a failure at any point rolls the vault back instead of
 * leaving it half imported. Wikilinks are preserved verbatim.
 */
export async function importNotes(notes: ImportedNote[]): Promise<ImportSummary> {
  const db = getDb();
  const now = Date.now();

  const counts = await db.transaction('rw', [db.notes, db.folders, db.links], async () => {
    const existing = await db.notes.toArray();
    // Tracks notes by slug, including ones written earlier in this same batch so
    // two identical files collapse into a single note.
    const bySlug = new Map<string, Note | null>(existing.map((note) => [note.slug, note]));

    let imported = 0;
    let updated = 0;
    const folderIds = new Set<string>();

    for (const item of notes) {
      const slug = slugify(item.title);
      const folderId = item.folderPath ? await ensureFolderPath(item.folderPath, db) : null;
      if (folderId) folderIds.add(folderId);

      const previous = bySlug.get(slug);

      if (previous === null) {
        // Same slug already written in this batch: refresh its content only.
        const latest = await db.notes.where('slug').equals(slug).first();
        if (latest) {
          await db.notes.put({ ...latest, content: item.content, folderId, updatedAt: now });
        }
        updated += 1;
        continue;
      }

      if (previous !== undefined) {
        await db.notes.put({
          ...previous,
          title: item.title,
          content: item.content,
          folderId,
          updatedAt: now,
          frontmatter: { ...previous.frontmatter, title: item.title },
        });
        updated += 1;
        continue;
      }

      const id = genId();
      bySlug.set(slug, null);
      await db.notes.add({
        id,
        slug,
        title: item.title,
        content: item.content,
        folderId,
        frontmatter: {
          title: item.title,
          created: toIsoDate(now),
          updated: toIsoDate(now),
        },
        createdAt: now,
        updatedAt: now,
        isPinned: false,
        isArchived: false,
      });
      imported += 1;
    }

    await reindexAllLinksCore(db);

    return { imported, updated, folders: folderIds.size };
  });

  return { ...counts, notes: await db.notes.toArray() };
}

/** Guards against restoring a file that is not one of our backups. */
function assertVaultBackup(value: unknown): asserts value is VaultBackup {
  const candidate = value as VaultBackup | null;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Backup file is not an object');
  }
  if (candidate.format !== 'obsidian-graph-backup') {
    throw new Error('Backup file has an unsupported format marker');
  }
  if (!Array.isArray(candidate.notes) || !Array.isArray(candidate.folders)) {
    throw new Error('Backup file is missing its notes or folders array');
  }
}

/** Restores a previously exported backup, replacing the current contents. */
export async function restoreVaultBackup(backup: VaultBackup): Promise<ImportSummary> {
  // Validation happens before any write so a bad file cannot wipe the vault.
  assertVaultBackup(backup);

  const db = getDb();

  await db.transaction('rw', [db.notes, db.folders, db.links], async () => {
    await db.notes.clear();
    await db.folders.clear();
    await db.links.clear();
    await db.folders.bulkPut(backup.folders);
    await db.notes.bulkPut(backup.notes);
  });

  await reindexAllLinks();

  return {
    imported: 0,
    updated: backup.notes.length,
    folders: backup.folders.length,
    notes: await db.notes.toArray(),
  };
}