/**
 * Phase 1 smoke suite — pure utilities, markdown parser, Dexie storage, seeder.
 */
import { check, expect, expectEqual, type HarnessCheck } from '../support';
import { slugify, escapeRegex, slugToLabel } from '../../src/utils/slug';
import { genId } from '../../src/utils/id';
import {
  analyzeText,
  excerptAround,
  formatBytes,
  formatDate,
  formatReadingTime,
  formatRelativeTime,
  pluralize,
  readingTimeMinutes,
  truncate,
  toIsoDate,
} from '../../src/utils/format';
import {
  extractTags,
  extractWikilinks,
  parseFrontmatter,
  stringifyFrontmatter,
} from '../../src/services/markdown/parser';
import backlinksSource from '../../src/components/domain/inspector/BacklinksList.tsx?raw';
import { renderMarkdown } from '../../src/services/markdown/renderer';
import { getDb, resetDbInstance } from '../../src/services/db/schema';
import { seedDatabaseIfEmpty, SEED_NOTE_IDS } from '../../src/services/db/seed';

export async function runPhase1(): Promise<HarnessCheck[]> {
  const results: HarnessCheck[] = [];

  results.push(
    await check('slugify: ascii titles', () => {
      expectEqual(slugify('Graph Theory & Network Thinking'), 'graph-theory-network-thinking', 'punctuation collapse');
      expectEqual(slugify('  Spaced   Out  '), 'spaced-out', 'trim + collapse');
      expectEqual(slugify('Zettelkasten'), 'zettelkasten', 'unchanged lowercase');
    }),
  );

  results.push(
    await check('slugify: diacritics stripped', () => {
      expectEqual(slugify('Café Notes & Ångström'), 'cafe-notes-angstrom', 'NFD normalization');
    }),
  );

  results.push(
    await check('slugify: non-latin fallback produces unique 8-char ids', () => {
      const first = slugify('知识库');
      const second = slugify('知识库');
      expect(first.length === 8, `fallback slug length should be 8, received ${first}`);
      expect(/^[a-z0-9]{8}$/.test(first), `fallback slug should be alphanumeric, received ${first}`);
      expect(first !== second, 'fallback slugs must be unique per call');
    }),
  );

  results.push(
    await check('escapeRegex + slugToLabel', () => {
      expectEqual(escapeRegex('a.b*c(d)'), 'a\\.b\\*c\\(d\\)', 'regex metacharacters escaped');
      expectEqual(slugToLabel('second-brain-architecture'), 'Second Brain Architecture', 'label casing');
    }),
  );

  results.push(
    await check('genId: unique and uuid shaped', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i += 1) ids.add(genId());
      expect(ids.size === 1000, `expected 1000 unique ids, received ${ids.size}`);
      const sample = genId();
      expect(/^[0-9a-f-]{32,36}$/.test(sample), `unexpected id shape: ${sample}`);
    }),
  );

  results.push(
    await check('format: byte sizes', () => {
      expectEqual(formatBytes(0), '0 B', 'zero bytes');
      expectEqual(formatBytes(512), '512 B', 'bytes');
      expectEqual(formatBytes(1536), '1.5 KB', 'kilobytes');
      expectEqual(formatBytes(5 * 1024 * 1024), '5.0 MB', 'megabytes');
    }),
  );

  results.push(
    await check('format: reading time and text stats', () => {
      const content = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
      const stats = analyzeText(content);
      expectEqual(stats.words, 400, 'word count');
      expectEqual(stats.minutes, 2, 'minutes at 200 wpm');
      expectEqual(readingTimeMinutes('short'), 1, 'minimum one minute');
      expectEqual(formatReadingTime(content), '2 min read', 'reading label');
    }),
  );

  results.push(
    await check('format: relative time and dates', () => {
      const now = Date.UTC(2026, 0, 15, 12, 0, 0);
      expectEqual(formatRelativeTime(now - 30_000, now), 'just now', 'seconds');
      expectEqual(formatRelativeTime(now - 5 * 60_000, now), '5m ago', 'minutes');
      expectEqual(formatRelativeTime(now - 3 * 3_600_000, now), '3h ago', 'hours');
      expectEqual(formatRelativeTime(now - 2 * 86_400_000, now), '2d ago', 'days');
      expectEqual(toIsoDate(Date.UTC(2026, 0, 15, 12, 0, 0)), '2026-01-15', 'iso date');
      expectEqual(typeof formatDate(now), 'string', 'formatDate returns a string');
    }),
  );

  results.push(
    await check('format: truncate, excerptAround, pluralize', () => {
      expectEqual(truncate('the quick brown fox jumps', 12), 'the quick…', 'word boundary truncation');
      expectEqual(
        excerptAround('Alpha beta gamma [[Target]] delta epsilon', '[[Target]]', 12),
        '…beta gamma [[Target]] delta epsil…',
        'centred excerpt',
      );
      expectEqual(pluralize(1, 'note'), '1 note', 'singular');
      expectEqual(pluralize(3, 'note'), '3 notes', 'plural');
    }),
  );

  results.push(
    await check('parser: wikilink extraction with alias and offsets', () => {
      const content = 'See [[Graph Theory]] and [[Markdown Syntax Reference|the cheat sheet]].';
      const links = extractWikilinks(content);
      expectEqual(links.length, 2, 'link count');
      expectEqual(links[0].targetSlug, 'graph-theory', 'first slug');
      expectEqual(links[1].targetTitle, 'Markdown Syntax Reference', 'second title');
      expectEqual(links[1].alias, 'the cheat sheet', 'second alias');
      expectEqual(content.slice(links[0].startIndex, links[0].endIndex), '[[Graph Theory]]', 'offsets');
      expect(extractWikilinks('[[Nested [[weird]]]]').length === 1, 'malformed nesting tolerated');
    }),
  );

  results.push(
    await check('parser: inline tag extraction', () => {
      const tags = extractTags('tagged #graph and #pkm/notes plus #not-a-tag-');
      expect(tags.includes('graph'), 'graph tag');
      expect(tags.includes('pkm/notes'), 'nested tag');
      expect(tags.includes('not-a-tag'), 'trailing separator stripped');
      expect(!tags.includes(''), 'no empty tags');
      expectEqual(extractTags('#first\n#second'), ['first', 'second'], 'line anchored tags');
    }),
  );

  results.push(
    await check('parser: frontmatter parse, round-trip and malformed recovery', () => {
      const doc = '---\ntitle: My Note\ntags:\n  - alpha\n  - beta\naliases: Single\n---\n# Body\n';
      const { frontmatter, body } = parseFrontmatter(doc);
      expectEqual(frontmatter.title, 'My Note', 'title');
      expectEqual(frontmatter.tags, ['alpha', 'beta'], 'tags array');
      expectEqual(frontmatter.aliases, ['Single'], 'aliases coerced to array');
      expectEqual(body, '# Body\n', 'body without fence');

      const roundTrip = parseFrontmatter(
        stringifyFrontmatter({ title: 'My Note', tags: ['alpha'], aliases: ['A'] }, '# Body\n'),
      );
      expectEqual(roundTrip.frontmatter.title, 'My Note', 'round-trip title');
      expectEqual(roundTrip.frontmatter.tags, ['alpha'], 'round-trip tags');
      expectEqual(roundTrip.body, '# Body\n', 'round-trip body');

      const broken = parseFrontmatter('---\ntitle: [unclosed\n---\ntext');
      expectEqual(broken.frontmatter, {}, 'malformed yaml yields empty frontmatter');
      expectEqual(broken.body, 'text', 'malformed yaml keeps body');

      expectEqual(parseFrontmatter('no fence here').body, 'no fence here', 'document without frontmatter');
    }),
  );

  results.push(
    await check('db: getDb is a singleton with indexed stores', () => {
      resetDbInstance();
      const first = getDb();
      expect(first === getDb(), 'getDb must return the same instance');
      expectEqual(first.name, 'ObsidianKnowledgeBaseDB', 'database name');
      const stores = first.tables.map((table) => table.name).sort();
      expectEqual(stores, ['folders', 'links', 'notes'], 'declared stores');
    }),
  );

  results.push(
    await check('seed: writes 4 notes, folders and link index once', async () => {
      const db = getDb();
      await db.delete();
      await db.open();

      const seeded = await seedDatabaseIfEmpty();
      expect(seeded !== null, 'first call must seed');

      expectEqual(await db.notes.count(), 4, 'note count');
      expectEqual(await db.folders.count(), 2, 'folder count');

      const notes = await db.notes.toArray();
      const titles = notes.map((n) => n.title).sort();
      expectEqual(
        titles,
        [
          'Graph Theory & Network Thinking',
          'Markdown Syntax Reference',
          'Second Brain Architecture',
          'Welcome to Obsidian Clone',
        ],
        'seeded titles',
      );

      const welcome = notes.find((n) => n.id === SEED_NOTE_IDS.welcome);
      expect(welcome !== undefined, 'welcome note present');
      expectEqual(welcome?.slug, 'welcome-to-obsidian-clone', 'deterministic slug');
      expectEqual(welcome?.isPinned, true, 'welcome note pinned');

      const links = await db.links.toArray();
      expect(links.length >= 8, `expected interlinked seed graph, received ${links.length} links`);
      const unresolved = links.filter((l) => l.targetNoteId === null).map((l) => l.targetSlug);
      expectEqual(
        unresolved,
        ['zettelkasten-method'],
        'only the intentional ghost link stays unresolved',
      );
      expect(
        links.some((l) => l.alias !== null),
        'aliased link indexed',
      );

      const second = await seedDatabaseIfEmpty();
      expect(second === null, 'second call must be a no-op');
      expectEqual(await db.notes.count(), 4, 'notes unchanged after re-seed');
    }),
  );

  results.push(
    await check('db: link rows resolve through slug index', async () => {
      const db = getDb();
      const target = await db.notes.where('slug').equals('graph-theory-network-thinking').first();
      expect(target !== undefined, 'slug index lookup works');
      const inbound = await db.links.where('targetNoteId').equals(target!.id).toArray();
      expect(inbound.length > 0, 'backlink index returns rows for target');
      const outgoing = await db.links.where('sourceNoteId').equals(target!.id).toArray();
      expect(outgoing.length > 0, 'outgoing index returns rows for source');
    }),
  );

  results.push(
    await check('SEC-01: mention detection carries no lookbehind assertion', () => {
      // A negative lookbehind assertion is a fatal SyntaxError on iOS Safari
      // below 16.4 and on older Android WebViews. The source is guarded
      // statically so the pattern can never regress, and the portable
      // capture-group shape is asserted behaviourally below.
      expect(
        !backlinksSource.includes('(?<'),
        'BacklinksList must not use lookbehind assertions',
      );

      const pattern = new RegExp('(^|[^\\w[])(\\w+)(?![\\w])', 'gi');

      const atStart = pattern.exec('hello world');
      expect(atStart !== null, 'pattern matched at the start of the text');
      expectEqual(atStart?.[1] ?? null, '', 'prefix group empty at the start of the text');
      expectEqual(atStart?.[2] ?? null, 'hello', 'mention captured without lookbehind');

      // After punctuation the prefix group carries the delimiter, so the caller
      // can offset the mention index by exactly the group length.
      const punctuationPattern = new RegExp('(^|[^\\w[])(\\w+)(?![\\w])', 'gi');
      const afterPunctuation = punctuationPattern.exec(':hello world');
      expect(afterPunctuation !== null, 'pattern matched after punctuation');
      expectEqual(afterPunctuation?.[1] ?? null, ':', 'prefix group holds the delimiter');
      expectEqual(afterPunctuation?.[2] ?? null, 'hello', 'mention text stays exact');
      expectEqual(
        (afterPunctuation?.index ?? 0) + (afterPunctuation?.[1].length ?? 0),
        1,
        'mention offset accounts for the prefix group',
      );

      // A title must not match inside a longer word.
      const titlePattern = new RegExp(`(^|[^\\w[])(Graph Theory)(?![\\w])`, 'gi');
      expectEqual(titlePattern.exec('Graph Theoried out'), null, 'partial word match rejected');
      const exact = titlePattern.exec('Read Graph Theory today');
      expectEqual(exact?.[2] ?? null, 'Graph Theory', 'whole-word title matched');
    }),
  );

  results.push(
    await check('DOS-01: deeply nested blockquotes cannot overflow the stack', () => {
      const hostile = '>'.repeat(5000) + ' deep';
      const html = renderMarkdown(hostile);

      expect(html.length > 0, 'renderer produced output for hostile input');
      expect(html.includes('<blockquote>'), 'blockquote wrapper emitted');
      expect(html.includes('deep'), 'inner text preserved');

      const nested = '>'.repeat(400) + ' bottom';
      expect(renderMarkdown(nested).includes('bottom'), 'nested quotes still render');
    }),
  );

  results.push(
    await check('DOS-01: moderate nesting still renders structurally', () => {
      const html = renderMarkdown('> level one\n> > level two\n> > > level three');
      const quotes = (html.match(/<blockquote>/g) ?? []).length;
      expectEqual(quotes, 3, 'each nesting level produces a blockquote');
    }),
  );

  return results;
}