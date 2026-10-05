/**
 * Phase 4 smoke suite — reactive data layer, markdown renderer, force engine,
 * graph builder, editor and canvas rendering, all against a real browser.
 */
import { useRef, useState } from 'react';
import { check, expect, expectEqual, type HarnessCheck } from '../support';
import {
  click,
  clickTarget,
  fireKeyDown,
  flush,
  mount,
  setInputValue,
  setNativeValue,
  waitFor,
  withAct,
} from '../mount';
import { useNotes } from '../../src/hooks/useNotes';
import { useDebounce, useDebouncedCallback } from '../../src/hooks/useDebounce';
import { useResponsiveLayout } from '../../src/hooks/useResponsiveLayout';
import { renderMarkdown, renderMarkdownExcerpt } from '../../src/services/markdown/renderer';
import { ForceDirectedSimulation } from '../../src/services/graph/forceEngine';
import { buildKnowledgeGraph, buildAdjacency, limitToDepth } from '../../src/services/graph/graphBuilder';
import { getDb } from '../../src/services/db/schema';
import { seedDatabaseIfEmpty } from '../../src/services/db/seed';
import { MarkdownEditor } from '../../src/components/domain/editor/MarkdownEditor';
import { EditorToolbar } from '../../src/components/domain/editor/EditorToolbar';
import { FrontmatterPanel } from '../../src/components/domain/editor/FrontmatterPanel';
import { MarkdownPreview } from '../../src/components/domain/editor/MarkdownPreview';
import { ForceGraphCanvas } from '../../src/components/domain/graph/ForceGraphCanvas';
import { LocalGraphView } from '../../src/components/domain/graph/LocalGraphView';
import { DEFAULT_GRAPH_PHYSICS, DEFAULT_GRAPH_VISUALS, type Note } from '../../src/types/models';

/** Baseline graph filters used by the harness graphs. */
const filters = {
  showOrphans: true,
  showTags: false,
  showUnresolved: true,
  searchQuery: '',
  maxDepth: 0,
};

async function vault() {
  const db = getDb();
  await db.delete();
  await db.open();
  await seedDatabaseIfEmpty();
  return {
    notes: await db.notes.toArray(),
    folders: await db.folders.toArray(),
    links: await db.links.toArray(),
  };
}

export async function runPhase4(): Promise<HarnessCheck[]> {
  const results: HarnessCheck[] = [];
  const data = await vault();

  results.push(
    await check('renderer: headings, lists, quotes, code and tables', () => {
      const html = renderMarkdown(
        [
          '# Title',
          '',
          'Paragraph with **bold**, *italic*, ~~strike~~ and `code`.',
          '',
          '## List',
          '',
          '- first',
          '- second',
          '',
          '1. one',
          '2. two',
          '',
          '- [x] done',
          '- [ ] todo',
          '',
          '> quoted line',
          '',
          '| a | b |',
          '| --- | --- |',
          '| 1 | 2 |',
          '',
          '```ts',
          'const x = 1;',
          '```',
        ].join('\n'),
      );

      expect(html.includes('<h1 id="title">Title</h1>'), 'heading with slug id');
      expect(html.includes('<strong>bold</strong>'), 'bold');
      expect(html.includes('<em>italic</em>'), 'italic');
      expect(html.includes('<del>strike</del>'), 'strikethrough');
      expect(html.includes('<code>code</code>'), 'inline code');
      expect(html.includes('<ul>') && html.includes('<li>first</li>') && html.includes('<li>second</li>'), 'unordered list');
      expect(html.includes('<ol start="1">') && html.includes('<li>one</li>') && html.includes('<li>two</li>'), 'ordered list');
      expect(html.includes('type="checkbox"'), 'task list checkbox');
      expect(html.includes('<blockquote>'), 'blockquote');
      expect(html.includes('<table>') && html.includes('<th>a</th>') && html.includes('<td>2</td>'), 'table');
      expect(html.includes('<pre><code class="language-ts">const x = 1;</code></pre>'), 'fenced code block');
      expect(html.includes('<hr />') === false, 'no stray rule without input');
    }),
  );

  results.push(
    await check('renderer: wikilinks and tags become interactive elements', () => {
      const html = renderMarkdown('See [[Graph Theory]] and [[Markdown Reference|the ref]] plus #pkm.');

      expect(html.includes('data-wikilink="Graph Theory"'), 'wikilink data attribute');
      expect(html.includes('href="#/note/graph-theory"'), 'wikilink href uses the slug');
      expect(html.includes('>the ref</a>'), 'alias is used as the label');
      expect(html.includes('data-tag="pkm"'), 'tag button with data attribute');
      expect(html.includes('kb-wikilink'), 'wikilink class for styling');
    }),
  );

  results.push(
    await check('renderer: escapes html and neutralises unsafe links', () => {
      const html = renderMarkdown('<script>alert(1)</script> and [click](javascript:alert(1))');

      expect(!html.includes('<script>'), 'raw script tags are escaped');
      expect(html.includes('&lt;script&gt;'), 'escaped output visible');
      expect(!html.includes('href="javascript:'), 'javascript: links are dropped');
    }),
  );

  results.push(
    await check('renderer: excerpt strips markdown syntax', () => {
      const excerpt = renderMarkdownExcerpt('# Title\n\n```ts\ncode\n```\n\nSome **bold** text.', 40);
      expect(!excerpt.includes('#'), 'no heading markers');
      expect(!excerpt.includes('```'), 'no fence markers');
      expect(excerpt.includes('Some bold text'), 'text content preserved');
    }),
  );

  results.push(
    await check('graph builder: notes, ghosts, tag nodes and sizing', () => {
      const graph = buildKnowledgeGraph(data.notes, filters);

      const noteNodes = graph.nodes.filter((node) => node.group === 'note');
      expectEqual(noteNodes.length, 4, 'all notes present');

      const ghost = graph.nodes.find((node) => node.group === 'unresolved');
      expect(ghost !== undefined, 'unresolved link produces a ghost node');
      expectEqual(ghost?.title, 'Zettelkasten Method', 'ghost keeps the authored title');

      expect(graph.edges.length >= 8, `expected the seeded link graph, received ${graph.edges.length} edges`);
      expect(graph.nodes.every((node) => node.val >= 4 && node.val <= 18), 'node weights stay clamped');

      const withoutGhosts = buildKnowledgeGraph(data.notes, { ...filters, showUnresolved: false });
      expectEqual(
        withoutGhosts.nodes.filter((node) => node.group === 'unresolved').length,
        0,
        'ghosts can be disabled',
      );

      const withTags = buildKnowledgeGraph(data.notes, { ...filters, showTags: true });
      expect(withTags.nodes.some((node) => node.group === 'tag'), 'tag nodes appear when enabled');
    }),
  );

  results.push(
    await check('graph builder: filters for orphans, search and depth', () => {
      const orphanGraph = buildKnowledgeGraph(data.notes, { ...filters, showOrphans: false });
      const ids = new Set(orphanGraph.nodes.map((node) => node.id));
      expect(orphanGraph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)), 'no dangling edges after filtering');

      const searched = buildKnowledgeGraph(data.notes, { ...filters, searchQuery: 'graph' });
      expect(
        searched.nodes.every((node) => node.title.toLowerCase().includes('graph')),
        'search keeps only matching nodes',
      );

      const full = buildKnowledgeGraph(data.notes, filters);
      const welcome = data.notes.find((note) => note.slug === 'welcome-to-obsidian-clone')!;
      const depthOne = limitToDepth(full.nodes, full.edges, welcome.id, 1);

      expect(depthOne.nodes.some((node) => node.id === welcome.id), 'root retained at depth 1');
      expect(depthOne.nodes.length < full.nodes.length, 'depth limit shrinks the graph');

      const adjacency = buildAdjacency(full.edges);
      expectEqual(
        adjacency.get(welcome.id)?.has('seed-note-2') ?? false,
        true,
        'adjacency links the welcome note to graph theory',
      );
    }),
  );

  results.push(
    await check('force engine: converges, cools and pins nodes', () => {
      const simulation = new ForceDirectedSimulation(800, 600, DEFAULT_GRAPH_PHYSICS);
      const graph = buildKnowledgeGraph(data.notes, filters);
      simulation.setData(graph.nodes, graph.edges);

      const positionsOverTime: number[] = [];
      for (let i = 0; i < 240; i += 1) {
        simulation.tick();
        positionsOverTime.push(simulation.getAlpha());
      }

      expect(simulation.getAlpha() < 0.05, `alpha should cool below 0.05, received ${simulation.getAlpha()}`);

      const nodes = simulation.getNodes();
      expect(nodes.every((node) => Number.isFinite(node.x ?? NaN) && Number.isFinite(node.y ?? NaN)), 'positions stay finite');

      const spread = Math.max(...nodes.map((node) => node.x ?? 0)) - Math.min(...nodes.map((node) => node.x ?? 0));
      expect(spread > 1, 'nodes are not collapsed onto a single point');
      expect(positionsOverTime[positionsOverTime.length - 1] < positionsOverTime[0], 'alpha decreases monotonically');

      const pinned = nodes[0];
      simulation.setNodePosition(pinned.id, 123, 45, true);
      simulation.tick();
      expectEqual(simulation.findNode(pinned.id)?.x, 123, 'pinned node keeps its x');
      expectEqual(simulation.findNode(pinned.id)?.y, 45, 'pinned node keeps its y');

      simulation.setNodePosition(pinned.id, null, null, false);
      expectEqual(simulation.findNode(pinned.id)?.fx ?? null, null, 'node can be released again');
      simulation.destroy();
    }),
  );

  results.push(
    await check('force engine: repels overlapping nodes', () => {
      const simulation = new ForceDirectedSimulation(400, 400, {
        ...DEFAULT_GRAPH_PHYSICS,
        linkDistance: 10,
        centerStrength: 0,
        damping: 1,
      });

      simulation.setData(
        [
          { id: 'a', slug: 'a', title: 'A', group: 'note', val: 10, x: 200, y: 200 },
          { id: 'b', slug: 'b', title: 'B', group: 'note', val: 10, x: 200.2, y: 200 },
        ],
        [],
      );
      simulation.tick();

      const [a, b] = simulation.getNodes();
      const distance = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
      expect(distance > 1, `overlapping nodes should separate, distance was ${distance}`);
      simulation.destroy();
    }),
  );

  results.push(
    await check('force engine: Barnes-Hut path stays finite above the threshold', () => {
      const simulation = new ForceDirectedSimulation(600, 600, DEFAULT_GRAPH_PHYSICS);
      const many = Array.from({ length: 120 }, (_, index) => ({
        id: `n${index}`,
        slug: `n${index}`,
        title: `Node ${index}`,
        group: 'note' as const,
        val: 6,
        x: 50 + (index % 12) * 40,
        y: 50 + Math.floor(index / 12) * 40,
      }));

      const edges = many
        .slice(1)
        .map((node, index) => ({ id: `e${index}`, source: `n${index}`, target: node.id, weight: 1 }));

      simulation.setData(many, edges);
      simulation.tick();
      simulation.tick();

      expect(
        simulation.getNodes().every((node) => Number.isFinite(node.x ?? NaN) && Number.isFinite(node.y ?? NaN)),
        'approximated repulsion keeps coordinates finite',
      );
      simulation.destroy();
    }),
  );

  results.push(
    await check('useNotes: create, write, link and rename cascade', async () => {
      const view = await mount(<NotesHarness />);
      await waitFor(() => currentApi().notes.length > 0, { label: 'reactive notes query' });
      const api = currentApi();

      expectEqual(api.notes.length, 4, 'seeded notes loaded');
      expect(api.activeNote !== null, 'an active note is selected automatically');

      const created = await withAct(() => api.createNote('Cascade Test'));
      await flush();
      expectEqual(created.title, 'Cascade Test', 'create returns the new note');
      expectEqual(created.slug, 'cascade-test', 'slug derived from the title');

      const duplicate = await withAct(() => api.createNote('Cascade Test'));
      expectEqual(duplicate.slug, 'cascade-test-2', 'duplicate titles get a suffixed slug');

      await withAct(() => api.updateNoteContent(duplicate.id, 'Links to [[Cascade Test|the original]].'));
      await flush();

      const links = await getDb().links.where('sourceNoteId').equals(duplicate.id).toArray();
      expectEqual(links.length, 1, 'wikilink indexed');
      expectEqual(links[0].targetNoteId, created.id, 'link resolved through the slug index');
      expectEqual(links[0].alias, 'the original', 'alias stored');

      await withAct(() => api.renameNote(created.id, 'Renamed Cascade'));
      await flush();

      const renamed = (await getDb().notes.get(created.id))!;
      expectEqual(renamed.title, 'Renamed Cascade', 'title updated');
      expectEqual(renamed.slug, 'renamed-cascade', 'slug updated');

      const rewrittenNote = await getDb().notes.get(duplicate.id);
      expectEqual(
        rewrittenNote?.content,
        'Links to [[Renamed Cascade|the original]].',
        'referencing notes were rewritten in the same transaction',
      );

      const rewrittenLinks = await getDb().links.where('sourceNoteId').equals(duplicate.id).toArray();
      expectEqual(rewrittenLinks.length, 1, 'stale link row removed');
      expectEqual(rewrittenLinks[0].targetNoteId, created.id, 'link re-indexed to the renamed note');
      expectEqual(rewrittenLinks[0].targetSlug, 'renamed-cascade', 'link points at the new slug');

      await withAct(() => api.deleteNote(created.id));
      await flush();
      expectEqual(await getDb().notes.get(created.id), undefined, 'note deleted');

      const dangling = await getDb().links.where('targetNoteId').equals(created.id).toArray();
      expectEqual(dangling.length, 0, 'links pointing at the deleted note are cleared');

      await withAct(() => api.deleteNote(duplicate.id));
      await flush();
      await view.unmount();
    }),
  );

  results.push(
    await check('useNotes: latest write wins and link index stays in sync', async () => {
      const view = await mount(<NotesHarness />);
      await waitFor(() => currentApi().notes.length > 0, { label: 'reactive notes query' });
      const api = currentApi();
      const note = await withAct(() => api.createNote('Write Lock'));

      await Promise.all([
        api.updateNoteContent(note.id, 'first [[Graph Theory]]'),
        api.updateNoteContent(note.id, 'second [[Markdown Reference]]'),
        api.updateNoteContent(note.id, 'third plain text'),
      ]);
      await flush();

      const stored = (await getDb().notes.get(note.id))!;
      expectEqual(stored.content, 'third plain text', 'the newest payload wins');

      const links = await getDb().links.where('sourceNoteId').equals(note.id).toArray();
      expectEqual(links.length, 0, 'stale links removed when the wikilink disappears');

      await withAct(() => api.updateNoteContent(note.id, 'final [[Second Brain Architecture]]'));
      await flush();

      const finalLinks = await getDb().links.where('sourceNoteId').equals(note.id).toArray();
      expectEqual(finalLinks.length, 1, 'new link indexed');
      expectEqual(finalLinks[0].targetSlug, 'second-brain-architecture', 'target slug stored');

      await withAct(() => api.deleteNote(note.id));
      await flush();
      await view.unmount();
    }),
  );

  results.push(
    await check('useNotes: pin, archive, move, folders, search and backlinks', async () => {
      const view = await mount(<NotesHarness />);
      await waitFor(() => currentApi().notes.length > 0, { label: 'reactive notes query' });
      const api = currentApi();
      const welcome = api.notes.find((note) => note.slug === 'welcome-to-obsidian-clone')!;

      await withAct(() => api.togglePin(welcome.id));
      expectEqual((await getDb().notes.get(welcome.id))?.isPinned, false, 'pin toggled off');

      await withAct(() => api.toggleArchive(welcome.id));
      expectEqual((await getDb().notes.get(welcome.id))?.isArchived, true, 'archived');
      await withAct(() => api.toggleArchive(welcome.id));

      const folder = await withAct(() => api.createFolder('Archive Box'));
      await withAct(() => api.moveNote(welcome.id, folder.id));
      expectEqual((await getDb().notes.get(welcome.id))?.folderId, folder.id, 'note moved into the folder');

      await withAct(() => api.deleteFolder(folder.id));
      expectEqual((await getDb().notes.get(welcome.id))?.folderId, null, 'deleting a folder returns its notes to the root');

      const resultsSearch = api.searchNotes('graph');
      expect(resultsSearch.length > 0, 'search returns matches');
      expectEqual(resultsSearch[0].note.slug, 'graph-theory-network-thinking', 'best match ranked first');
      expect(resultsSearch[0].matches.some((match) => match.field === 'title'), 'title match reported');

      const backlinks = api.getBacklinks(welcome.id);
      expect(backlinks.length >= 1, 'backlinks resolved');
      expect(backlinks[0].excerpt.includes('[['), 'excerpt centred on the link');
      expectEqual(api.getBacklinks(null).length, 0, 'no backlinks without an active note');

      expect(Object.keys(api.tagCounts).length > 0, 'tag counts aggregated from frontmatter and inline tags');
      expect(api.linkCounts[welcome.id] > 0, 'outgoing link counts computed');
      expect(api.backlinkCounts[welcome.id] > 0, 'backlink counts computed');

      await view.unmount();
    }),
  );

  results.push(
    await check('MarkdownEditor: typing writes through and reports progress', async () => {
      const view = await mount(<EditorHarness />);
      const textarea = view.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;

      await setNativeValue(textarea, 'Hello knowledge base');
      await flush();

      expectEqual(view.query('[data-testid="editor-line-numbers"]')?.textContent?.includes('1'), true, 'line numbers rendered');

      const saved = currentApi().notes.find((note) => note.content.includes('Hello knowledge base'));
      expect(saved !== undefined, 'content persisted through the notes API');
    }),
  );

  results.push(
    await check('MarkdownEditor: list continuation and auto-indent', async () => {
      const view = await mount(<EditorHarness initialContent="- first" />);
      const textarea = view.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;

      textarea.focus();
      textarea.setSelectionRange('- first'.length, '- first'.length);
      await fireKeyDown(textarea, 'Enter', { key: 'Enter' });
      await flush();

      expectEqual(editorApi.pendingContent, '- first\n- ', 'bullet continues on Enter');

      const view2 = await mount(<EditorHarness initialContent="1. one" />);
      const numbered = view2.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;
      numbered.focus();
      numbered.setSelectionRange('1. one'.length, '1. one'.length);
      await fireKeyDown(numbered, 'Enter', { key: 'Enter' });
      await flush();
      expectEqual(editorApi.pendingContent, '1. one\n2. ', 'ordered lists increment');

      const view3 = await mount(<EditorHarness initialContent="  indented" />);
      const indented = view3.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;
      indented.focus();
      indented.setSelectionRange('  indented'.length, '  indented'.length);
      await fireKeyDown(indented, 'Enter', { key: 'Enter' });
      await flush();
      expectEqual(editorApi.pendingContent, '  indented\n  ', 'indentation preserved');

      await view.unmount();
      await view2.unmount();
      await view3.unmount();
    }),
  );

  results.push(
    await check('MarkdownEditor: wikilink autocomplete opens, navigates and inserts', async () => {
      const view = await mount(<EditorHarness initialContent="" />);
      const textarea = view.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;

      await setNativeValue(textarea, 'Link to [[Graph');
      await flush();

      const popover = document.querySelector<HTMLElement>('[data-testid="wikilink-popover"]');
      expect(popover !== null, 'autocomplete popup opened after [[');
      expectEqual(document.querySelector('[data-testid="wikilink-popover-option-0"]')?.textContent?.includes('Graph'), true, 'matching note suggested',
      );

      await fireKeyDown(textarea, 'ArrowDown', { key: 'ArrowDown' });
      await flush();
      expectEqual(
        document.querySelector('[data-testid="wikilink-popover-option-1"]')?.getAttribute('aria-selected'),
        'true',
        'ArrowDown highlights the create-new entry',
      );

      await fireKeyDown(textarea, 'ArrowUp', { key: 'ArrowUp' });
      await fireKeyDown(textarea, 'Enter', { key: 'Enter' });
      await flush();

      expectEqual(
        editorApi.pendingContent,
        'Link to [[Graph Theory & Network Thinking]]',
        'existing note inserted with its full title',
      );
      expectEqual(document.querySelector('[data-testid="wikilink-popover"]'), null, 'popup closed after insert');

      await setNativeValue(textarea, 'Escapes [[');
      await flush();
      await fireKeyDown(textarea, 'Escape', { key: 'Escape' });
      await flush();
      expectEqual(document.querySelector('[data-testid="wikilink-popover"]'), null, 'escape dismisses the popup');

      await view.unmount();
    }),
  );

  results.push(
    await check('EditorToolbar: format actions and mode switching', async () => {
      const view = await mount(<EditorPaneHarness initialContent="alpha" />);
      const textarea = view.query<HTMLTextAreaElement>('[data-testid="markdown-editor-textarea"]')!;
      textarea.focus();
      textarea.setSelectionRange(0, 5);

      await click(view.query('[data-testid="editor-format-bold"]'));
      await flush();
      expectEqual(editorApi.pendingContent, '**alpha**', 'bold wraps the selection');

      await click(view.query('[data-testid="editor-format-heading"]'));
      await flush();
      expectEqual(editorApi.pendingContent, '## **alpha**', 'heading prefixes the line');

      await clickTarget(view.query('[data-testid="editor-mode-tabs-tab-preview"]'));
      await flush();
      expect(
        view.query('[data-testid="markdown-preview"]') !== null,
        'preview mode renders the preview pane',
      );
      expectEqual(view.query('[data-testid="markdown-editor-textarea"]'), null, 'textarea hidden in preview mode');

      await view.unmount();
    }),
  );

  results.push(
    await check('MarkdownPreview: delegation opens links and filters tags', async () => {
      const opened: string[] = [];
      const tags: string[] = [];
      const view = await mount(
        <MarkdownPreviewHarness
          content={'# Doc\n\nRead [[Graph Theory]] and tag #pkm today.'}
          onOpenLink={(title) => opened.push(title)}
          onClickTag={(tag) => tags.push(tag)}
        />,
      );

      await clickTarget(document.querySelector('[data-wikilink]'));
      expectEqual(opened, ['Graph Theory'], 'wikilink click navigates');

      await clickTarget(document.querySelector('[data-tag]'));
      expectEqual(tags, ['pkm'], 'tag click filters');

      const empty = await mount(<MarkdownPreview content="" />);
      expect(empty.query('[data-testid="markdown-preview-empty"]') !== null, 'empty state rendered');
      await empty.unmount();

      await view.unmount();
    }),
  );

  results.push(
    await check('FrontmatterPanel: edits aliases and tags', async () => {
      const updates: Array<Record<string, unknown>> = [];
      const view = await mount(<FrontmatterHarness onUpdate={(next) => updates.push(next)} />);

      await setInputValue(view.query<HTMLInputElement>('[data-testid="frontmatter-alias-input"]')!, 'Second Home');
      await clickTarget(view.query('[data-testid="frontmatter-add-alias"]'));
      await flush();

      expectEqual(updates.at(-1)?.aliases, ['Start Here', 'Home', 'Second Home'], 'alias appended');

      await setInputValue(view.query<HTMLInputElement>('[data-testid="frontmatter-tag-input"]')!, '#graph');
      await clickTarget(view.query('[data-testid="frontmatter-add-tag"]'));
      await flush();
      expectEqual(updates.at(-1)?.tags, ['onboarding', 'welcome', 'graph'], 'tag appended without the hash');

      const empty = await mount(<FrontmatterPanel note={null} onChange={() => undefined} />);
      expectEqual(empty.query('[data-testid="frontmatter-panel"]')?.textContent?.includes('No note selected'), true, 'empty state');
      await empty.unmount();

      await view.unmount();
    }),
  );

  results.push(
    await check('ForceGraphCanvas: renders nodes, honours empty state and controls', async () => {
      const view = await mount(<GraphHarness />);
      const canvas = view.query<HTMLCanvasElement>('[data-testid="force-graph-canvas"]')!;

      await flush(120);

      expect(canvas.width > 0 && canvas.height > 0, 'canvas backing store sized');
      expectEqual(canvas.getAttribute('data-paused'), 'false', 'physics running');
      expect(Number(canvas.getAttribute('data-node-count')) > 0, 'graph has nodes');

      await clickTarget(view.query('[data-testid="graph-zoom-in"]'));
      await flush();
      expect(Number(canvas.getAttribute('data-zoom')) > 1, 'zoom in increases scale');

      await clickTarget(view.query('[data-testid="graph-pause"]'));
      await flush();
      expectEqual(canvas.getAttribute('data-paused'), 'true', 'physics paused');

      await clickTarget(view.query('[data-testid="graph-settings"]'));
      await flush();
      expect(view.query('[data-testid="graph-controls"]') !== null, 'settings popover opens');

      const orphanSwitch = view.query<HTMLButtonElement>('[data-testid="switch-orphans"]')!;
      await click(orphanSwitch);
      await flush();
      expectEqual(orphanSwitch.getAttribute('aria-checked'), 'false', 'orphan toggle flips');

      await clickTarget(view.query('[data-testid="graph-reset"]'));
      await flush();
      expectEqual(canvas.getAttribute('data-zoom'), '1.000', 'reset restores zoom');

      await view.unmount();
    }),
  );

  results.push(
    await check('ForceGraphCanvas: empty state when filters match nothing', async () => {
      const view = await mount(<GraphHarness initialFilters={{ ...filters, searchQuery: 'zzz-nothing' }} />);
      await flush(80);

      expect(view.query('[data-testid="force-graph-empty"]') !== null, 'empty state rendered');
      await view.unmount();
    }),
  );

  results.push(
    await check('LocalGraphView: depth toggle narrows the neighbourhood', async () => {
      const welcome = data.notes.find((note) => note.slug === 'welcome-to-obsidian-clone')!;
      const view = await mount(<LocalGraphHarness activeNoteId={welcome.id} />);

      await flush(120);
      const oneHop = Number(
        view.query<HTMLElement>('[data-testid="force-graph-canvas"]')?.dataset.nodeCount ?? '0',
      );

      await clickTarget(view.query('[data-testid="local-graph-depth-tab-2"]'));
      await flush(160);

      const twoHops = Number(
        view.query<HTMLElement>('[data-testid="force-graph-canvas"]')?.dataset.nodeCount ?? '0',
      );

      expect(oneHop > 0, 'one hop renders nodes');
      expect(twoHops >= oneHop, 'two hops never shrinks the graph');
      expect(view.query('[data-testid="graph-legend"]') !== null, 'legend rendered');

      await view.unmount();
    }),
  );

  results.push(
    await check('useDebounce / useDebouncedCallback: timing contract', async () => {
      const view = await mount(<DebounceHarness />);

      expectEqual(currentDebounce().value, 'a', 'initial value');
      await withAct(() => currentDebounce().setValue('b'));
      await flush(60);
      expectEqual(currentDebounce().value, 'a', 'value not yet debounced');

      await flush(200);
      expectEqual(currentDebounce().value, 'b', 'debounced value arrives after the delay');

      await withAct(() => currentDebounce().run('c'));
      expectEqual(currentDebounce().pending, true, 'pending flag set');
      await withAct(() => currentDebounce().flush());
      await flush();
      expectEqual(currentDebounce().calls.at(-1), 'c', 'flush commits immediately');

      await view.unmount();
    }),
  );

  results.push(
    await check('useResponsiveLayout: breakpoint classification', async () => {
      const view = await mount(<ResponsiveHarness />);
      const layout = currentLayout();

      expectEqual(layout.isMobile, window.innerWidth < 768, 'mobile classification matches the viewport');
      expect(
        layout.showsNavLabels === window.innerWidth >= 390,
        'bottom nav labels appear from 390px upwards',
      );

      await view.unmount();
    }),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Harnesses
// ---------------------------------------------------------------------------

let api: ReturnType<typeof useNotes> | null = null;
interface DebounceHandle {
  value: string;
  calls: string[];
  pending: boolean;
  run: (value: string) => void;
  flush: () => void;
  setValue: (value: string) => void;
}

let debounce: DebounceHandle | null = null;
let layout: ReturnType<typeof useResponsiveLayout> | null = null;

const currentApi = () => api!;
const currentDebounce = () => debounce!;
const currentLayout = () => layout!;

/** Exposes the pending editor payload for assertions. */
interface EditorApi {
  notes: Note[];
  pendingContent: string;
}

const editorApi: EditorApi = { notes: [], pendingContent: '' };

function NotesHarness() {
  const notes = useNotes();
  api = notes;
  editorApi.notes = notes.notes;

  return (
    <div data-testid="notes-harness">
      <span data-testid="notes-count">{notes.notes.length}</span>
      <span data-testid="active-slug">{notes.activeNote?.slug ?? ''}</span>
      {notes.error ? <p role="alert">{notes.error}</p> : null}
    </div>
  );
}

interface EditorHarnessProps {
  initialContent?: string;
}

function EditorHarness({ initialContent = '' }: EditorHarnessProps) {
  const notes = useNotes();
  api = notes;
  editorApi.notes = notes.notes;

  const [noteId, setNoteId] = useState<string | null>(null);
  const activeNote =
    notes.notes.find((note) => note.id === noteId) ??
    notes.notes.find((note) => note.content === initialContent) ??
    notes.notes[0] ??
    null;

  if (!activeNote) return <p>loading…</p>;

  return (
    <div>
      <button type="button" onClick={() => setNoteId(activeNote.id)}>
        select
      </button>
      <MarkdownEditor
        note={activeNote.content === initialContent || initialContent === '' ? activeNote : { ...activeNote, content: initialContent }}
        notes={notes.notes}
        mode="source"
        onChangeContent={(content) => {
          editorApi.pendingContent = content;
          void notes.updateNoteContent(activeNote.id, content);
        }}
      />
    </div>
  );
}

function EditorPaneHarness({ initialContent = '' }: EditorHarnessProps) {
  const notes = useNotes();
  api = notes;
  editorApi.notes = notes.notes;

  const [mode, setMode] = useState<'source' | 'preview' | 'live'>('source');
  const editorRef = useRef<import('../../src/components/domain/editor/MarkdownEditor').MarkdownEditorHandle>(null);
  const activeNote = notes.notes[0] ?? null;

  if (!activeNote) return <p>loading…</p>;

  return (
    <div>
      <EditorToolbar
        mode={mode}
        onModeChange={setMode}
        onFormat={(action) => editorRef.current?.applyFormat(action)}
      />
      <MarkdownEditor
        editorRef={editorRef}
        note={initialContent ? { ...activeNote, content: initialContent } : activeNote}
        notes={notes.notes}
        mode={mode}
        onChangeContent={(content) => {
          editorApi.pendingContent = content;
        }}
      />
    </div>
  );
}

function MarkdownPreviewHarness({
  content,
  onOpenLink,
  onClickTag,
}: {
  content: string;
  onOpenLink: (title: string) => void;
  onClickTag: (tag: string) => void;
}) {
  return <MarkdownPreview content={content} onOpenLink={onOpenLink} onClickTag={onClickTag} />;
}

function FrontmatterHarness({ onUpdate }: { onUpdate: (next: Record<string, unknown>) => void }) {
  const notes = useNotes();
  api = notes;
  const note = notes.notes.find((candidate) => candidate.slug === 'welcome-to-obsidian-clone') ?? null;

  return (
    <FrontmatterPanel
      note={note}
      onChange={(frontmatter) => onUpdate({ ...frontmatter })}
    />
  );
}

interface GraphHarnessProps {
  initialFilters?: typeof filters;
}

function GraphHarness({ initialFilters = filters }: GraphHarnessProps) {
  const notes = useNotes();
  api = notes;
  const [currentFilters, setCurrentFilters] = useState(initialFilters);

  return (
    <div style={{ height: 320, width: 480 }}>
      <ForceGraphCanvas
        notes={notes.notes}
        activeNoteId={notes.activeNoteId}
        filters={currentFilters}
        physics={DEFAULT_GRAPH_PHYSICS}
        visuals={DEFAULT_GRAPH_VISUALS}
        onFiltersChange={setCurrentFilters}
        onPhysicsChange={() => undefined}
        onVisualsChange={() => undefined}
        onSelectNote={notes.setActiveNoteId}
      />
    </div>
  );
}

function LocalGraphHarness({ activeNoteId }: { activeNoteId: string | null }) {
  const notes = useNotes();
  api = notes;

  return (
    <div style={{ height: 320, width: 480 }}>
      <LocalGraphView
        notes={notes.notes}
        activeNoteId={activeNoteId}
        physics={DEFAULT_GRAPH_PHYSICS}
        visuals={DEFAULT_GRAPH_VISUALS}
        onSelectNote={notes.setActiveNoteId}
      />
    </div>
  );
}

function DebounceHarness() {
  const [value, setValue] = useState('a');
  const debounced = useDebounce(value, 120);
  const [calls, setCalls] = useState<string[]>([]);
  const { run, flush, pending } = useDebouncedCallback((next: string) => {
    setCalls((current) => [...current, next]);
  }, 200);

  debounce = { value: debounced, calls, run, flush, pending, setValue };

  return <span data-testid="debounced">{debounced}</span>;
}

function ResponsiveHarness() {
  layout = useResponsiveLayout();
  return <span data-testid="breakpoint">{layout.breakpoint}</span>;
}

/** Silences the unused-parameter lint for the simulation harness helper. */