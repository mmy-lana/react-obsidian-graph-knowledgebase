/**
 * Phase 5 smoke suite — import/export, preferences persistence helpers and the
 * assembly-level contracts the shell depends on.
 */
import { check, expect, expectEqual } from '../support';
import { getDb } from '../../src/services/db/schema';
import { seedDatabaseIfEmpty } from '../../src/services/db/seed';
import {
  downloadMarkdownFiles,
  exportVault,
  importNotes,
  noteToMarkdown,
  parseMarkdownFile,
  restoreVaultBackup,
  type VaultBackup,
} from '../../src/services/db/transfer';
import { slugify } from '../../src/utils/slug';
import {
  DEFAULT_GRAPH_FILTERS,
  DEFAULT_GRAPH_PHYSICS,
  DEFAULT_GRAPH_VISUALS,
  DEFAULT_PREFERENCES,
} from '../../src/types/models';

export async function runPhase5(): Promise<import('../support').HarnessCheck[]> {
  const results: import('../support').HarnessCheck[] = [];

  const db = getDb();
  await db.delete();
  await db.open();
  await seedDatabaseIfEmpty();

  results.push(
    await check('defaults: preferences seed sensible graph settings', () => {
      expectEqual(DEFAULT_PREFERENCES.graphPhysics, DEFAULT_GRAPH_PHYSICS, 'physics defaults');
      expectEqual(DEFAULT_PREFERENCES.graphFilters, DEFAULT_GRAPH_FILTERS, 'filter defaults');
      expectEqual(DEFAULT_PREFERENCES.graphVisuals, DEFAULT_GRAPH_VISUALS, 'visual defaults');
      expectEqual(DEFAULT_PREFERENCES.activeView, 'split', 'split view on first run');
      expect(DEFAULT_GRAPH_PHYSICS.chargeStrength > 0, 'positive charge strength');
      expect(DEFAULT_GRAPH_PHYSICS.alphaDecay > 0 && DEFAULT_GRAPH_PHYSICS.alphaDecay < 1, 'valid cooling rate');
    }),
  );

  results.push(
    await check('export: vault backup contains notes and folders', async () => {
      const backup = await exportVault();

      expectEqual(backup.format, 'obsidian-graph-backup', 'backup format marker');
      expectEqual(backup.version, 1, 'backup version');
      expectEqual(backup.notes.length, 4, 'all notes exported');
      expectEqual(backup.folders.length, 2, 'all folders exported');
      expectEqual(Number.isNaN(Date.parse(backup.exportedAt)), false, 'export timestamp is a valid date');
    }),
  );

  results.push(
    await check('export: markdown serialisation round-trips through the parser', () => {
      const original = {
        id: 'x',
        slug: 'round-trip',
        title: 'Round Trip',
        content: 'Body with [[Second Brain Architecture]] and #pkm',
        folderId: null,
        frontmatter: { title: 'Round Trip', tags: ['pkm'], created: '2026-01-01', updated: '2026-01-02' },
        createdAt: 1_767_225_600_000,
        updatedAt: 1_767_225_600_000,
        isPinned: false,
        isArchived: false,
      };

      const markdown = noteToMarkdown(original);
      expect(markdown.startsWith('---\n'), 'frontmatter fence written');
      expect(markdown.includes('tags: [pkm]'), 'tags serialised');

      const parsed = parseMarkdownFile('round-trip.md', markdown);
      expectEqual(parsed.title, 'Round Trip', 'title recovered');
      expectEqual(parsed.content, original.content, 'body recovered verbatim');
      expectEqual(parsed.folderPath, null, 'root-level file has no folder');
    }),
  );

  results.push(
    await check('import: markdown files create notes, folders and links', async () => {
      const before = await db.notes.count();

      const summary = await importNotes([
        parseMarkdownFile(
          'Imported/Daily Notes/2026-01-05.md',
          '---\ntags: [journal]\n---\nDiscussed [[Second Brain Architecture]] and captured #ideas',
        ),
        parseMarkdownFile('Ideas.md', 'Raw thought linking to [[Second Brain Architecture]]'),
        parseMarkdownFile('Ideas.md', 'Raw thought linking to [[Second Brain Architecture]]'),
      ]);

      expectEqual(summary.imported, 2, 'two new notes imported');
      expectEqual(summary.updated, 1, 'duplicate slug updated instead of duplicated');
      expectEqual(await db.notes.count(), before + 2, 'note count grew by exactly two');

      const folderNames = (await db.folders.toArray()).map((folder) => folder.name);
      expect(folderNames.includes('Imported'), 'folder path created');
      expect(folderNames.includes('Daily Notes'), 'nested folder created');

      const daily = (await db.notes.toArray()).find((note) => note.slug === '2026-01-05');
      expect(daily !== undefined, 'imported note stored');
      expectEqual(daily?.folderId !== null, true, 'note attached to its folder');

      const links = await db.links.where('targetSlug').equals('second-brain-architecture').toArray();
      expect(links.length >= 5, `wikilinks re-indexed after import, received ${links.length}`);

      const resolved = links.every((link) => link.targetNoteId === 'seed-note-4');
      expectEqual(resolved, true, 'imported links resolve to the existing target');
    }),
  );

  results.push(
    await check('import: nested folder paths reuse existing folders', async () => {
      await importNotes([
        parseMarkdownFile('Imported/Daily Notes/2026-01-06.md', 'Follow-up entry'),
        parseMarkdownFile('Imported/Reference/Deep Dive.md', 'Reference material'),
      ]);

      const folders = await db.folders.toArray();
      const dailyNotes = folders.filter((folder) => folder.name === 'Daily Notes');
      expectEqual(dailyNotes.length, 1, 'folder reused rather than duplicated');

      const reference = folders.find((folder) => folder.name === 'Reference');
      expect(reference !== undefined, 'sibling folder created');
      expectEqual(reference?.parentId, dailyNotes[0].parentId, 'sibling shares the parent');
    }),
  );

  results.push(
    await check('restore: a backup replaces the vault and re-indexes links', async () => {
      const backup = await exportVault();
      const pristineCount = backup.notes.length;

      await importNotes([parseMarkdownFile('Scratch.md', 'temporary content')]);
      expect(await db.notes.count() > pristineCount, 'vault grew before restore');

      const summary = await restoreVaultBackup(backup);

      expectEqual(summary.updated, pristineCount, 'restore reports the restored notes');
      expectEqual(await db.notes.count(), pristineCount, 'vault size restored');
      expectEqual(await db.links.where('sourceNoteId').equals('seed-note-1').count() > 0, true, 'links re-indexed');

      const scratch = await db.notes.filter((note) => note.slug === 'scratch').first();
      expectEqual(scratch, undefined, 'notes added after the backup are gone');
    }),
  );

  results.push(
    await check('restore: rejects malformed backups without touching data', async () => {
      const before = await db.notes.count();
      let rejected = false;

      try {
        await restoreVaultBackup({ format: 'nonsense' } as unknown as VaultBackup);
      } catch {
        rejected = true;
      }

      expectEqual(rejected, true, 'invalid backup rejected');
      expectEqual(await db.notes.count(), before, 'vault unchanged after an invalid restore');
    }),
  );

  results.push(
    await check('download: markdown export produces one download per note', async () => {
      const originalRevoke = URL.revokeObjectURL;
      const anchors: HTMLAnchorElement[] = [];

      // Real object URLs keep the browser happy; only the anchor clicks are
      // captured so nothing actually navigates or saves during the check.
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        anchors.push(this);
      };
      URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

      try {
        const folders = Object.fromEntries((await db.folders.toArray()).map((f) => [f.id, f.name]));
        const count = await downloadMarkdownFiles(folders);
        expectEqual(count, await db.notes.count(), 'one file per note');
        expectEqual(anchors.length, count, 'one download triggered per note');
        expect(
          anchors.every((anchor) => anchor.download.endsWith('.md')),
          'filenames end with .md',
        );
        expect(anchors.some((anchor) => anchor.download.includes('/')), 'folder notes carry their folder prefix');
      } finally {
        HTMLAnchorElement.prototype.click = originalClick;
        URL.revokeObjectURL = originalRevoke;
      }
    }),
  );

  results.push(
    await check('import: file names without frontmatter derive titles from the path', () => {
      const parsed = parseMarkdownFile('Reference/Deep-Dive.md', '# Heading\n\nBody');
      expectEqual(parsed.title, 'Deep Dive', 'title derived from the file name');
      expectEqual(parsed.folderPath, 'Reference', 'folder derived from the path');
      expectEqual(slugify(parsed.title), 'deep-dive', 'derived title slugifies cleanly');
    }),
  );

  return results;
}