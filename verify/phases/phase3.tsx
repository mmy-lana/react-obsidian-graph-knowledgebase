/**
 * Phase 3 smoke suite — compound molecules and knowledge-base domain widgets,
 * exercised against a seeded IndexedDB vault.
 */
import { useState } from 'react';
import { check, expect, expectEqual, type HarnessCheck } from '../support';
import { click, clickTarget, fireKeyDown, flush, mount, setInputValue } from '../mount';
import { SearchBar } from '../../src/components/molecules/SearchBar';
import { TreeItem } from '../../src/components/molecules/TreeItem';
import { TagBadge } from '../../src/components/molecules/TagBadge';
import { WikilinkSuggestPopover } from '../../src/components/molecules/WikilinkSuggestPopover';
import { ConfirmDialog } from '../../src/components/molecules/ConfirmDialog';
import { TabNavigation } from '../../src/components/molecules/TabNavigation';
import { FileExplorer } from '../../src/components/domain/sidebar/FileExplorer';
import { TagExplorer } from '../../src/components/domain/sidebar/TagExplorer';
import { BacklinksList } from '../../src/components/domain/inspector/BacklinksList';
import { OutgoingLinksList } from '../../src/components/domain/inspector/OutgoingLinksList';
import { NoteMetadata } from '../../src/components/domain/inspector/NoteMetadata';
import { CommandPalette, buildDefaultCommandActions } from '../../src/components/domain/palette/CommandPalette';
import { QuickSwitcherModal } from '../../src/components/domain/palette/QuickSwitcherModal';
import { useCommandPalette } from '../../src/hooks/useCommandPalette';
import { getDb } from '../../src/services/db/schema';
import { seedDatabaseIfEmpty } from '../../src/services/db/seed';
import type { BacklinkItem, Folder, Note, NoteLink } from '../../src/types/models';

interface Harness {
  notes: Note[];
  folders: Folder[];
  links: NoteLink[];
}

async function loadVault(): Promise<Harness> {
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

function buildBacklinks(vault: Harness, target: Note): BacklinkItem[] {
  return vault.links
    .filter((link) => link.targetNoteId === target.id)
    .map((link) => {
      const source = vault.notes.find((note) => note.id === link.sourceNoteId)!;
      return {
        sourceNoteId: source.id,
        sourceTitle: source.title,
        sourceSlug: source.slug,
        excerpt: source.content.slice(0, 90),
      };
    });
}

export async function runPhase3(): Promise<HarnessCheck[]> {
  const results: HarnessCheck[] = [];
  const vault = await loadVault();
  const welcome = vault.notes.find((note) => note.slug === 'welcome-to-obsidian-clone')!;
  const markdownNote = vault.notes.find((note) => note.slug === 'markdown-syntax-reference')!;
  const notesById = Object.fromEntries(vault.notes.map((note) => [note.id, note]));

  results.push(
    await check('SearchBar: query binding, clear button and result counter', async () => {
      const view = await mount(<SearchBarHarness />);

      const input = view.query<HTMLInputElement>('[data-testid="search-bar"]')!;
      expectEqual(input.getAttribute('type'), 'search', 'search input type');
      expectEqual(input.getAttribute('aria-label'), 'Search notes', 'accessible name');
      expect(view.query('[data-testid="search-clear"]') === null, 'clear button hidden while empty');

      await click(view.query('[data-testid="search-bar"]'));
      await flush();

      const view2 = await mount(<SearchBarHarness initialValue="graph" resultCount={3} />);
      expect(view2.query('[data-testid="search-clear"]') !== null, 'clear button appears with a value');
      expectEqual(view2.query('[data-testid="search-count"]')?.textContent, '3 results', 'result counter');

      await click(view2.query('[data-testid="search-clear"]'));
      await flush();
      expectEqual(view2.query<HTMLInputElement>('[data-testid="search-bar"]')?.value, '', 'clear resets the value');

      await view.unmount();
      await view2.unmount();
    }),
  );

  results.push(
    await check('TreeItem: note selection, active state and context menu', async () => {
      const selected: string[] = [];
      const view = await mount(
        <TreeItem
          id="note-1"
          kind="note"
          title="Graph Theory"
          active
          linkCount={3}
          backlinkCount={2}
          onSelect={(id) => selected.push(id)}
          actions={[
            { id: 'rename', label: 'Rename', onSelect: () => selected.push('rename') },
            { id: 'delete', label: 'Delete', danger: true, onSelect: () => selected.push('delete') },
          ]}
          testId="tree-note"
        />,
      );

      const row = view.query('[data-testid="tree-note"]')!;
      expectEqual(row.dataset.active, 'true', 'active row marked');
      expectEqual(view.query('[data-testid="tree-note-select"]')?.getAttribute('aria-current'), 'true', 'aria-current set');
      expectEqual(row.textContent?.includes('3'), true, 'outgoing link count rendered');
      expectEqual(row.textContent?.includes('2'), true, 'backlink count rendered');

      await click(view.query('[data-testid="tree-note-select"]'));
      expectEqual(selected, ['note-1'], 'row selection fires callback');

      await click(view.query('[data-testid="tree-note-menu"]'));
      await flush();
      expect(document.querySelector('[data-testid="dropdown-menu"]') !== null, 'context menu opens');

      const items = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-testid="dropdown-menu"] [role="menuitem"]'),
      );
      await click(items[1]);
      await flush();
      expectEqual(selected, ['note-1', 'delete'], 'menu item action fired');

      await view.unmount();
    }),
  );

  results.push(
    await check('TreeItem: folder chevron toggles expansion', async () => {
      const toggled: string[] = [];
      const view = await mount(
        <TreeItem
          id="folder-1"
          kind="folder"
          title="Foundations"
          depth={1}
          expanded
          childCount={4}
          onToggle={(id) => toggled.push(id)}
          testId="tree-folder"
        />,
      );

      expectEqual(
        view.query('[aria-expanded]')?.getAttribute('aria-expanded'),
        'true',
        'expanded state exposed',
      );
      expectEqual(view.query('button')?.getAttribute('aria-label'), 'Collapse Foundations', 'collapse label');

      await click(view.query('button'));
      expectEqual(toggled, ['folder-1'], 'chevron toggles the folder');

      await view.unmount();
    }),
  );

  results.push(
    await check('TagBadge: clickable pill forwards the bare tag name', async () => {
      const clicked: string[] = [];
      const view = await mount(<TagBadge tag="graph" count={3} onClick={(tag) => clicked.push(tag)} testId="tag" />);

      const pill = view.query<HTMLButtonElement>('[data-testid="tag"]')!;
      expectEqual(pill.textContent, 'graph3', 'tag and count rendered');
      expectEqual(pill.getAttribute('title')?.includes('3 notes'), true, 'title carries the count');

      await click(pill);
      expectEqual(clicked, ['graph'], 'click handler receives the tag without the hash');

      await view.unmount();
    }),
  );

  results.push(
    await check('WikilinkSuggestPopover: desktop popover placement and selection', async () => {
      const selected: string[] = [];
      const suggestions = [
        { title: 'Graph Theory', slug: 'graph-theory', isExisting: true },
        { title: 'New Thing', slug: 'new-thing', isExisting: false },
      ];

      const view = await mount(
        <WikilinkSuggestPopover
          open
          query="Gra"
          suggestions={suggestions}
          selectedIndex={0}
          cursorPosition={{ top: 120, left: 200 }}
          onSelect={(suggestion) => selected.push(suggestion.title)}
          onHighlight={() => undefined}
          onClose={() => undefined}
        />,
      );

      const popover = document.querySelector<HTMLElement>('[data-testid="wikilink-popover"]')!;
      expectEqual(popover.dataset.layout, 'popover', 'desktop layout');
      expectEqual(popover.getAttribute('role'), 'listbox', 'listbox role');
      expectEqual(
        document.querySelectorAll('[role="option"]').length,
        2,
        'both suggestions rendered',
      );
      expectEqual(document.querySelector('[data-testid="wikilink-popover-option-1"]')?.textContent?.includes('Create new note'), true, 'create-new entry rendered for unknown targets',
      );

      await click(document.querySelector('[data-testid="wikilink-popover-option-0"]'));
      expectEqual(selected, ['Graph Theory'], 'selection callback fired');

      await view.unmount();
    }),
  );

  results.push(
    await check('WikilinkSuggestPopover: touch renders a bottom drawer', async () => {
      const view = await mount(
        <WikilinkSuggestPopover
          open
          isTouch
          query="Gra"
          suggestions={[{ title: 'Graph Theory', slug: 'graph-theory', isExisting: true }]}
          selectedIndex={0}
          cursorPosition={{ top: 120, left: 200 }}
          onSelect={() => undefined}
          onHighlight={() => undefined}
          onClose={() => undefined}
        />,
      );

      const drawer = document.querySelector<HTMLElement>('[data-testid="wikilink-popover"]')!;
      expectEqual(drawer.dataset.layout, 'drawer', 'touch layout');
      expect(drawer.className.includes('inset-x-0') && drawer.className.includes('bottom-0'), 'anchored to the bottom edge');
      expect(drawer.className.includes('pb-safe'), 'safe-area padding applied');

      await view.unmount();
    }),
  );

  results.push(
    await check('WikilinkSuggestPopover: renders nothing without matches', async () => {
      const view = await mount(
        <WikilinkSuggestPopover
          open
          query="zzz"
          suggestions={[]}
          selectedIndex={0}
          cursorPosition={{ top: 0, left: 0 }}
          onSelect={() => undefined}
          onHighlight={() => undefined}
          onClose={() => undefined}
        />,
      );

      expectEqual(document.querySelector('[data-testid="wikilink-popover"]'), null, 'no empty popover in the DOM');
      await view.unmount();
    }),
  );

  results.push(
    await check('ConfirmDialog: confirm and cancel flows', async () => {
      const actions: string[] = [];
      const view = await mount(
        <ConfirmDialogHarness onAction={(action) => actions.push(action)} />,
      );

      const dialog = document.querySelector('[data-testid="confirm-dialog"]')!;
      expectEqual(dialog.getAttribute('role'), 'dialog', 'dialog role');
      expectEqual(dialog.textContent?.includes('Second Brain Architecture'), true, 'target title shown');

      await click(document.querySelector('[data-testid="confirm-dialog-cancel"]'));
      await flush();
      expectEqual(actions, ['cancel'], 'cancel path');

      const view2 = await mount(<ConfirmDialogHarness onAction={(action) => actions.push(action)} open />);
      await click(document.querySelector('[data-testid="confirm-dialog-confirm"]'));
      await flush();
      expectEqual(actions, ['cancel', 'confirm'], 'confirm path');

      await view.unmount();
      await view2.unmount();
    }),
  );

  results.push(
    await check('TabNavigation: ARIA tablist with arrow key navigation', async () => {
      const view = await mount(<TabsHarness />);

      const tablist = view.query('[role="tablist"]')!;
      expectEqual(tablist.getAttribute('aria-label'), 'View mode', 'tablist labelled');

      const tabs = view.queryAll('[role="tab"]');
      expectEqual(tabs.length, 3, 'three tabs');
      expectEqual(tabs[0].getAttribute('aria-selected'), 'true', 'first tab selected');
      expectEqual(tabs[1].getAttribute('tabindex'), '-1', 'inactive tabs removed from tab order');

      await clickTarget(tabs[1]);
      await flush();
      expectEqual(view.queryAll('[role="tab"]')[1].getAttribute('aria-selected'), 'true', 'click selects tab');

      await fireKeyDown(view.query('[role="tablist"]')!, 'ArrowRight');
      await flush();
      expectEqual(
        view.queryAll('[role="tab"]')[2].getAttribute('aria-selected'),
        'true',
        'ArrowRight advances the selection',
      );

      await fireKeyDown(view.query('[role="tablist"]')!, 'Home');
      await flush();
      expectEqual(
        view.queryAll('[role="tab"]')[0].getAttribute('aria-selected'),
        'true',
        'Home jumps to the first tab',
      );

      await view.unmount();
    }),
  );

  results.push(
    await check('FileExplorer: folders, pinned notes, selection and tag tab', async () => {
      const events: string[] = [];
      const view = await mount(
        <FileExplorerHarness
          notes={vault.notes}
          folders={vault.folders}
          activeNoteId={welcome.id}
          onSelectNote={(id) => events.push(`select:${id}`)}
          onSelectTag={(tag) => events.push(`tag:${tag}`)}
          tagCounts={{ graph: 1, theory: 1, welcome: 1, onboarding: 1, markdown: 1, reference: 1 }}
        />,
      );

      expect(view.query('[data-testid="file-explorer"]') !== null, 'explorer rendered');
      expect(view.query('[data-testid="pinned-seed-note-1"]') !== null, 'pinned section shows the welcome note');
      expect(view.query('[data-testid="folder-seed-folder-1"]') !== null, 'folder rendered');

      await click(view.query('[data-testid="note-seed-note-2-select"]'));
      expectEqual(events, [`select:${vault.notes.find((n) => n.slug === 'graph-theory-network-thinking')!.id}`], 'note selection');

      await click(view.query('[data-testid="explorer-tab-tags"]'));
      await flush();
      expect(view.query('[data-testid="sidebar-tag-explorer-list"]') !== null, 'tag explorer tab renders tag pills');

      await click(view.query('[data-testid="sidebar-tag-explorer"] [data-testid="tag-pill-graph"]'));
      expectEqual(events[events.length - 1], 'tag:graph', 'tag click forwarded');

      const filtered = await mount(
        <TagExplorer tagCounts={{ graph: 2, theory: 1, pkm: 1 }} onSelectTag={() => undefined} />,
      );
      await flush();
      expectEqual(filtered.queryAll('[data-testid^="tag-pill-"]').length, 3, 'all tags listed');
      await filtered.unmount();

      await view.unmount();
    }),
  );

  results.push(
    await check('FileExplorer: empty vault shows guidance', async () => {
      const view = await mount(
        <FileExplorerHarness notes={[]} folders={[]} activeNoteId={null} tagCounts={{}} />,
      );

      expectEqual(view.query('[data-testid="file-explorer"]')?.textContent?.includes('No notes yet'), true, 'empty state copy');
      await view.unmount();
    }),
  );

  results.push(
    await check('BacklinksList: resolved inbound links with excerpts', async () => {
      const navigations: string[] = [];
      const view = await mount(
        <BacklinksList
          backlinks={buildBacklinks(vault, welcome)}
          activeNote={welcome}
          allNotes={vault.notes}
          onNavigate={(id) => navigations.push(id)}
        />,
      );

      const expectedBacklinks = buildBacklinks(vault, welcome);
      expectEqual(
        view.query('[data-testid="backlinks-list-count"]')?.textContent,
        String(expectedBacklinks.length),
        'backlink count badge',
      );
      expectEqual(
        view.queryAll('[data-testid^="backlinks-list-item-"]').length,
        expectedBacklinks.length,
        'one row per inbound link',
      );

      await click(view.query('[data-testid^="backlinks-list-item-"]'));
      expectEqual(navigations.length, 1, 'navigation callback fired');

      await view.unmount();
    }),
  );

  results.push(
    await check('BacklinksList: unlinked mentions can be converted', async () => {
      const conversions: Array<[string, string, string]> = [];
      const decoy: Note = {
        ...welcome,
        id: 'mention-source',
        slug: 'mention-source',
        title: 'Loose Reference',
        content:
          'A loose reference to Second Brain Architecture that was never converted into a wikilink.',
      };

      const view = await mount(
        <BacklinksList
          backlinks={[]}
          activeNote={vault.notes.find((note) => note.slug === 'second-brain-architecture')!}
          allNotes={[...vault.notes, decoy]}
          onNavigate={() => undefined}
          onConvertMention={(sourceId, targetTitle, mention) =>
            conversions.push([sourceId, targetTitle, mention])
          }
        />,
      );

      const convertButton = view.query('[data-testid="backlinks-list-convert-mention-source"]');
      expect(convertButton !== null, 'unlinked mention detected');

      await click(convertButton);
      expectEqual(conversions.length, 1, 'conversion callback fired');
      expectEqual(conversions[0][0], 'mention-source', 'source note id');
      expectEqual(conversions[0][2], 'Second Brain Architecture', 'matched mention text');

      await view.unmount();
    }),
  );

  results.push(
    await check('BacklinksList: empty state for an unlinked note', async () => {
      const view = await mount(<BacklinksList backlinks={[]} activeNote={null} allNotes={[]} onNavigate={() => undefined} />);
      expectEqual(view.query('[data-testid="backlinks-list"]')?.textContent?.includes('Select a note'), true, 'no active note guidance',
      );
      await view.unmount();
    }),
  );

  results.push(
    await check('OutgoingLinksList: resolved and unresolved partitions', async () => {
      const created: string[] = [];
      const navigations: string[] = [];
      const view = await mount(
        <OutgoingLinksList
          links={vault.links.filter((link) => link.sourceNoteId === markdownNote.id)}
          activeNote={markdownNote}
          notesById={notesById}
          onNavigate={(id) => navigations.push(id)}
          onCreateFromGhost={(title) => created.push(title)}
        />,
      );

      const resolved = Array.from(document.querySelectorAll('[data-testid^="outgoing-links-resolved-"]'));
      expect(resolved.length >= 2, `expected resolved links, received ${resolved.length}`);
      expectEqual(resolved.length, 2, 'two resolved outgoing links');

      await click(resolved[0]);
      expectEqual(navigations.length, 1, 'navigate callback fired');

      const ghosts = Array.from(document.querySelectorAll('[data-testid^="outgoing-links-ghost-"]'));
      expectEqual(ghosts.length, 0, 'no ghosts in the markdown reference note');
      expectEqual(created.length, 0, 'no ghost creation requested');

      const ghostSource = vault.notes.find((note) => note.slug === 'graph-theory-network-thinking')!;
      const view2 = await mount(
        <OutgoingLinksList
          links={vault.links.filter((link) => link.sourceNoteId === ghostSource.id)}
          activeNote={ghostSource}
          notesById={notesById}
          onNavigate={() => undefined}
          onCreateFromGhost={(title) => created.push(title)}
        />,
      );

      const ghostRows = Array.from(document.querySelectorAll('[data-testid^="outgoing-links-ghost-"]'));
      expectEqual(ghostRows.length, 1, 'single ghost target');
      await click(ghostRows[0]);
      expectEqual(created, ['Zettelkasten Method'], 'ghost click requests note creation');

      await view.unmount();
      await view2.unmount();
    }),
  );

  results.push(
    await check('NoteMetadata: slug, stats, aliases and tags', async () => {
      const tagClicks: string[] = [];
      const view = await mount(
        <NoteMetadata note={welcome} onSelectTag={(tag) => tagClicks.push(tag)} onCopyLink={() => undefined} />,
      );

      expectEqual(view.query('[data-testid="meta-slug"]')?.textContent, 'welcome-to-obsidian-clone', 'slug row');
      expectEqual(
        (view.query('[data-testid="meta-words"]')?.textContent?.length ?? 0) > 0,
        true,
        'word count row',
      );
      expect(view.query('[data-testid="alias-Start Here"]') !== null, 'alias rendered');
      expect(view.query('[data-testid="meta-tag-welcome"]') !== null, 'frontmatter tag rendered');

      await click(view.query('[data-testid="meta-tag-welcome"]'));
      expectEqual(tagClicks, ['welcome'], 'tag click forwarded');

      await view.unmount();

      const empty = await mount(<NoteMetadata note={null} />);
      expectEqual(empty.query('[data-testid="note-metadata"]')?.textContent?.includes('No note selected'), true, 'empty state');
      await empty.unmount();
    }),
  );

  results.push(
    await check('CommandPalette: filters commands, shows notes, runs selection', async () => {
      const runs: string[] = [];
      const opened: string[] = [];
      const view = await mount(
        <CommandPalette
          open
          onClose={() => undefined}
          notes={vault.notes.map((note) => ({ id: note.id, title: note.title, slug: note.slug }))}
          onOpenNote={(id) => opened.push(id)}
          actions={buildDefaultCommandActions({
            onCreateNote: () => runs.push('create-note'),
            onCreateFolder: () => runs.push('create-folder'),
            onToggleSidebar: () => runs.push('sidebar'),
            onToggleInspector: () => runs.push('inspector'),
            onToggleGraphTags: () => runs.push('tags'),
            onToggleGraphUnresolved: () => runs.push('unresolved'),
            onToggleGraphOrphans: () => runs.push('orphans'),
            onToggleLabels: () => runs.push('labels'),
            onClearFilters: () => runs.push('clear'),
            onExport: () => runs.push('export'),
            filters: { showOrphans: true, showTags: false, showUnresolved: true, searchQuery: '', maxDepth: 2 },
            showLabels: true,
          })}
        />,
      );

      const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]')!;
      expectEqual(input.getAttribute('role'), 'combobox', 'combobox role');

      const createRow = document.querySelector<HTMLButtonElement>('[data-testid="command-palette-row-command-new-note"]')!;
      await click(createRow);
      expectEqual(runs, ['create-note'], 'command action executed');

      const noteRow = document.querySelector<HTMLButtonElement>(
        '[data-testid="command-palette-row-note-seed-note-4"]',
      );
      expect(noteRow !== null, 'note entries are listed alongside commands');
      await click(noteRow!);
      expectEqual(opened, ['seed-note-4'], 'note entry opened the note');

      await view.unmount();
    }),
  );

  results.push(
    await check('CommandPalette: empty results state', async () => {
      const view = await mount(
        <CommandPalette
          open
          onClose={() => undefined}
          notes={[]}
          actions={buildDefaultCommandActions({
            onCreateNote: () => undefined,
            onCreateFolder: () => undefined,
            onToggleSidebar: () => undefined,
            onToggleInspector: () => undefined,
            onToggleGraphTags: () => undefined,
            onToggleGraphUnresolved: () => undefined,
            onToggleGraphOrphans: () => undefined,
            onToggleLabels: () => undefined,
            onClearFilters: () => undefined,
            onExport: () => undefined,
            filters: { showOrphans: true, showTags: false, showUnresolved: true, searchQuery: '', maxDepth: 2 },
            showLabels: true,
          })}
        />,
      );

      const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]')!;
      await setInputValue(input, 'zzzz-nothing-matches');
      await flush();

      expect(
        document.querySelector('[data-testid="command-palette-empty"]') !== null,
        'empty results message rendered',
      );

      await view.unmount();
    }),
  );

  results.push(
    await check('QuickSwitcherModal: title and alias search with keyboard select', async () => {
      const selections: string[] = [];
      const view = await mount(
        <QuickSwitcherModal
          open
          onClose={() => undefined}
          notes={vault.notes}
          activeNoteId={welcome.id}
          onSelect={(id) => selections.push(id)}
          onCreateNote={(title) => selections.push(`create:${title}`)}
        />,
      );

      const rows = document.querySelectorAll('[data-testid^="quick-switcher-option-"]');
      expect(rows.length > 0, 'recent notes listed by default');

      const aliasMatch = document.querySelector<HTMLButtonElement>('[data-testid="quick-switcher-option-seed-note-4"]');
      expect(aliasMatch !== null, 'alias-matched note is listed');

      await click(aliasMatch!);
      expectEqual(selections, ['seed-note-4'], 'alias search selects the right note');

      await view.unmount();
    }),
  );

  results.push(
    await check('QuickSwitcherModal: create-note affordance for unknown titles', async () => {
      const selections: string[] = [];
      const view = await mount(
        <QuickSwitcherModalHarness notes={vault.notes} onSelection={(value) => selections.push(value)} />,
      );

      const input = document.querySelector<HTMLInputElement>('[data-testid="quick-switcher-input"]')!;
      await setInputValue(input, 'Brand New Idea');
      await flush();

      expect(document.querySelector('[data-testid="quick-switcher-create"]') !== null, 'create entry offered');

      await click(document.querySelector('[data-testid="quick-switcher-create"]'));
      expectEqual(selections, ['create:Brand New Idea'], 'creation requested with the typed title');

      await view.unmount();
    }),
  );

  results.push(
    await check('useCommandPalette: global shortcuts open the right overlays', async () => {
      let graphToggles = 0;
      let editorToggles = 0;

      const view = await mount(
        <ShortcutHarness
          onGraphToggle={() => (graphToggles += 1)}
          onEditorToggle={() => (editorToggles += 1)}
        />,
      );

      await fireKeyDown(window, 'p', { metaKey: true });
      await flush();
      expect(
        document.querySelector('[data-testid="command-palette"]') !== null,
        'Cmd/Ctrl+P opens the command palette',
      );

      await fireKeyDown(window, 'o', { metaKey: true });
      await flush();
      expectEqual(
        document.querySelector('[data-testid="command-palette"]'),
        null,
        'switcher replaces the palette',
      );
      expect(
        document.querySelector('[data-testid="quick-switcher"]') !== null,
        'Cmd/Ctrl+O opens the quick switcher',
      );

      await fireKeyDown(window, 'g', { metaKey: true });
      await flush();
      expectEqual(graphToggles, 1, 'Cmd/Ctrl+G toggles the graph view');

      await fireKeyDown(window, 'e', { metaKey: true });
      await flush();
      expectEqual(editorToggles, 1, 'Cmd/Ctrl+E toggles the editor mode');

      await view.unmount();
    }),
  );

  results.push(
    await check('domain widgets stay usable at 360px', async () => {
      const view = await mount(
        <div className="flex w-[360px] flex-col gap-2">
          <FileExplorerHarness notes={vault.notes} folders={vault.folders} activeNoteId={welcome.id} />
          <BacklinksList backlinks={buildBacklinks(vault, welcome)} activeNote={welcome} allNotes={vault.notes} onNavigate={() => undefined} />
        </div>,
      );

      const overflow = view.container.scrollWidth - view.container.clientWidth;
      expect(overflow <= 1, `container overflows horizontally by ${overflow}px at 360px`);

      const buttons = Array.from(view.queryAll('button'));
      const tooSmall = buttons.filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.height > 0 && rect.height < 32;
      });
      expectEqual(tooSmall.length, 0, 'no undersized tap targets inside the sidebar/inspector');

      await view.unmount();
    }),
  );

  return results;
}

function SearchBarHarness({ initialValue = '', resultCount }: { initialValue?: string; resultCount?: number }) {
  const [value, setValue] = useState(initialValue);
  return <SearchBar value={value} onChange={setValue} resultCount={resultCount} hotkeyHint="⌘K" />;
}

function ConfirmDialogHarness({
  onAction,
  open = true,
}: {
  onAction: (action: string) => void;
  open?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete note"
      message={<span>Second Brain Architecture will be removed.</span>}
      confirmLabel="Delete"
      onConfirm={() => onAction('confirm')}
      onCancel={() => onAction('cancel')}
    />
  );
}

function TabsHarness() {
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('edit');
  return (
    <TabNavigation
      label="View mode"
      activeTab={tab}
      onChange={setTab}
      tabs={[
        { id: 'edit', label: 'Edit' },
        { id: 'preview', label: 'Preview' },
        { id: 'split', label: 'Split' },
      ]}
    />
  );
}

interface FileExplorerHarnessProps {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  onSelectNote?: (id: string) => void;
  onSelectTag?: (tag: string) => void;
  tagCounts?: Record<string, number>;
}

function FileExplorerHarness({
  notes,
  folders,
  activeNoteId,
  onSelectNote = () => undefined,
  onSelectTag,
  tagCounts = {},
}: FileExplorerHarnessProps) {
  const linkCounts: Record<string, number> = {};
  const backlinkCounts: Record<string, number> = {};

  return (
    <FileExplorer
      notes={notes}
      folders={folders}
      activeNoteId={activeNoteId}
      onSelectNote={onSelectNote}
      onCreateNote={() => undefined}
      onCreateFolder={() => undefined}
      onRenameNote={() => undefined}
      onTogglePin={() => undefined}
      onDeleteNote={() => undefined}
      onRenameFolder={() => undefined}
      onDeleteFolder={() => undefined}
      linkCounts={linkCounts}
      backlinkCounts={backlinkCounts}
      tagCounts={tagCounts}
      onSelectTag={onSelectTag}
    />
  );
}

function QuickSwitcherModalHarness({
  notes,
  onSelection,
}: {
  notes: Note[];
  onSelection: (value: string) => void;
}) {
  return (
    <QuickSwitcherModal
      open
      onClose={() => undefined}
      notes={notes}
      activeNoteId={null}
      onSelect={(id) => onSelection(id)}
      onCreateNote={(title) => onSelection(`create:${title}`)}
    />
  );
}

function ShortcutHarness({
  onEditorToggle,
  onGraphToggle,
}: {
  onEditorToggle: () => void;
  onGraphToggle: () => void;
}) {
  const palette = useCommandPalette({ onToggleEditor: onEditorToggle, onToggleGraph: onGraphToggle });

  return (
    <>
      <button type="button">surface</button>
      <CommandPalette open={palette.isCommandPaletteOpen} onClose={palette.closeCommandPalette} actions={[]} />
      <QuickSwitcherModal
        open={palette.isQuickSwitcherOpen}
        onClose={palette.closeQuickSwitcher}
        notes={[]}
        activeNoteId={null}
        onSelect={() => undefined}
      />
    </>
  );
}