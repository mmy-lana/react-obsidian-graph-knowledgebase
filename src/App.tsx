import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Loader2, RefreshCw, X } from 'lucide-react';
import { AppLayout } from './components/shell/AppLayout';
import { AppHeader } from './components/shell/AppHeader';
import { SplitPaneContainer } from './components/shell/SplitPaneContainer';
import { MobileNavBar } from './components/shell/MobileNavBar';
import { MobileDrawer } from './components/shell/MobileDrawer';
import { FileExplorer } from './components/domain/sidebar/FileExplorer';
import { EditorToolbar, type EditorFormatAction } from './components/domain/editor/EditorToolbar';
import { MarkdownEditor, type MarkdownEditorHandle } from './components/domain/editor/MarkdownEditor';
import { FrontmatterPanel } from './components/domain/editor/FrontmatterPanel';
import { ForceGraphCanvas } from './components/domain/graph/ForceGraphCanvas';
import { LocalGraphView } from './components/domain/graph/LocalGraphView';
import { BacklinksList } from './components/domain/inspector/BacklinksList';
import { OutgoingLinksList } from './components/domain/inspector/OutgoingLinksList';
import { NoteMetadata } from './components/domain/inspector/NoteMetadata';
import { CommandPalette, buildDefaultCommandActions } from './components/domain/palette/CommandPalette';
import { QuickSwitcherModal } from './components/domain/palette/QuickSwitcherModal';
import { PromptDialog } from './components/molecules/PromptDialog';
import { SearchBar } from './components/molecules/SearchBar';
import { TagBadge } from './components/molecules/TagBadge';
import { Button } from './components/ui/Button';
import { useNotes } from './hooks/useNotes';
import { useNoteLinks } from './hooks/useNoteLinks';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useResponsiveLayout } from './hooks/useResponsiveLayout';
import { useDebounce } from './hooks/useDebounce';
import { seedDatabaseIfEmpty, SEED_DEFAULT_NOTE_ID } from './services/db/seed';
import {
  downloadMarkdownFiles,
  downloadVaultBackup,
  importNotes,
  parseMarkdownFile,
  restoreVaultBackup,
  type VaultBackup,
} from './services/db/transfer';
import { slugify } from './utils/slug';
import { DEFAULT_GRAPH_FILTERS, DEFAULT_GRAPH_PHYSICS, DEFAULT_GRAPH_VISUALS } from './types/models';
import type {
  EditorMode,
  GraphFilterSettings,
  GraphPhysicsSettings,
  GraphVisualSettings,
  ViewMode,
} from './types/models';

type MobilePane = 'explorer' | 'search' | 'editor' | 'graph' | 'inspector';

const EMPTY_MESSAGE = 'No note selected';

export const App: React.FC = () => {
  const api = useNotes();
  const layout = useResponsiveLayout();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [editorMode, setEditorMode] = useState<EditorMode>('live');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [physics, setPhysics] = useState<GraphPhysicsSettings>(DEFAULT_GRAPH_PHYSICS);
  const [visuals, setVisuals] = useState<GraphVisualSettings>(DEFAULT_GRAPH_VISUALS);
  const [filters, setFilters] = useState<GraphFilterSettings>(DEFAULT_GRAPH_FILTERS);
  const [pendingRename, setPendingRename] = useState<
    { kind: 'note'; id: string; title: string } | { kind: 'folder'; id: string; title: string } | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 200);
  const links = useNoteLinks(api.activeNoteId);
  const searchResults = useMemo(() => api.searchNotes(debouncedSearch), [api.searchNotes, debouncedSearch]);
  const backlinks = useMemo(() => api.getBacklinks(api.activeNoteId), [api.getBacklinks, api.activeNoteId]);
  const notesById = useMemo(
    () => Object.fromEntries(api.notes.map((note) => [note.id, note])),
    [api.notes],
  );

  const graphFilters = useMemo<GraphFilterSettings>(
    () => ({ ...filters, searchQuery: activeTag ? `#${activeTag}` : debouncedSearch }),
    [filters, activeTag, debouncedSearch],
  );

  // First boot: seed the vault when it is still empty.
  useEffect(() => {
    let cancelled = false;

    void seedDatabaseIfEmpty()
      .then(() => {
        if (cancelled) return;
        const welcome = api.notes.find((note) => note.id === SEED_DEFAULT_NOTE_ID);
        if (!api.activeNoteId && welcome) api.setActiveNoteId(welcome.id);
      })
      .catch(() => {
        /* the reactive query surfaces storage errors through api.error */
      });

    return () => {
      cancelled = true;
    };
    // Seeding must run exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openNoteByTitle = useCallback(
    (title: string) => {
      const slug = slugify(title);
      const target = api.notes.find((note) => note.slug === slug);
      if (target) {
        api.setActiveNoteId(target.id);
        setMobilePane('editor');
        return;
      }

      void api.createNote(title).then((note) => {
        api.setActiveNoteId(note.id);
        setMobilePane('editor');
        setToast(`Created “${note.title}”`);
      });
    },
    [api],
  );

  const toggleEditorMode = useCallback(() => {
    setEditorMode((mode) => (mode === 'preview' ? 'source' : 'preview'));
  }, []);

  const toggleGraph = useCallback(() => {
    setViewMode((mode) => (mode === 'graph' ? 'split' : 'graph'));
    setMobilePane((pane) => (pane === 'graph' ? 'editor' : 'graph'));
  }, []);

  const palette = useCommandPalette({
    onToggleEditor: toggleEditorMode,
    onToggleGraph: toggleGraph,
    onFocusSearch: () => {
      if (layout.isMobile) setMobilePane('search');
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    },
    onCreateNote: () => void api.createNote('Untitled'),
  });

  const exportMarkdownFiles = async () => {
    const folderNames: Record<string, string> = {};
    for (const folder of api.folders) folderNames[folder.id] = folder.name;
    const count = await downloadMarkdownFiles(folderNames);
    setToast(`Exported ${count} markdown ${count === 1 ? 'file' : 'files'}`);
  };

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const parsed = [];
    for (const file of Array.from(files)) {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      parsed.push(parseMarkdownFile(relative, await file.text()));
    }

    const summary = await importNotes(parsed);
    setToast(`Imported ${summary.imported} new, updated ${summary.updated} ${summary.updated === 1 ? 'note' : 'notes'}`);
  };

  const handleRestoreBackup = async (file: File | undefined) => {
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text()) as VaultBackup;
      if (backup.format !== 'obsidian-graph-backup') {
        setToast('That file is not a knowledge base backup');
        return;
      }
      const summary = await restoreVaultBackup(backup);
      setToast(`Restored ${summary.updated} ${summary.updated === 1 ? 'note' : 'notes'}`);
    } catch {
      setToast('Could not read the backup file');
    }
  };

  const commandActions = useMemo(
    () =>
      buildDefaultCommandActions({
        onCreateNote: () => void api.createNote('Untitled'),
        onCreateFolder: () => void api.createFolder('New folder'),
        onToggleSidebar: () => setSidebarOpen((open) => !open),
        onToggleInspector: () => setInspectorOpen((open) => !open),
        onToggleGraphTags: () => setFilters((current) => ({ ...current, showTags: !current.showTags })),
        onToggleGraphUnresolved: () =>
          setFilters((current) => ({ ...current, showUnresolved: !current.showUnresolved })),
        onToggleGraphOrphans: () =>
          setFilters((current) => ({ ...current, showOrphans: !current.showOrphans })),
        onToggleLabels: () => setVisuals((current) => ({ ...current, showLabels: !current.showLabels })),
        onClearFilters: () => {
          setFilters(DEFAULT_GRAPH_FILTERS);
          setSearchQuery('');
          setActiveTag(null);
        },
        onExport: () => void downloadVaultBackup(),
        filters,
        showLabels: visuals.showLabels,
      }),
    [api, filters, visuals.showLabels],
  );

  const breadcrumbs = useMemo(() => {
    const note = api.activeNote;
    if (!note) return [];
    if (!note.folderId) return [note.title];

    const trail: string[] = [];
    let current = api.folders.find((folder) => folder.id === note.folderId);
    while (current) {
      trail.unshift(current.name);
      current = api.folders.find((folder) => folder.id === current?.parentId);
    }
    trail.push(note.title);
    return trail;
  }, [api.activeNote, api.folders]);

  const editorPane = (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar
        mode={editorMode}
        onModeChange={setEditorMode}
        onFormat={(action: EditorFormatAction) => editorRef.current?.applyFormat(action)}
        disabled={!api.activeNote}
      />
      <MarkdownEditor
        editorRef={editorRef}
        note={api.activeNote}
        notes={api.notes}
        mode={editorMode}
        onChangeContent={(content) => {
          if (api.activeNote) void api.updateNoteContent(api.activeNote.id, content);
        }}
        onOpenLink={openNoteByTitle}
        onClickTag={(tag) => {
          setActiveTag(tag);
          setFilters((current) => ({ ...current, showTags: true }));
        }}
      />
    </div>
  );

  const graphPane = (
    <ForceGraphCanvas
      notes={api.notes}
      activeNoteId={api.activeNoteId}
      filters={graphFilters}
      physics={physics}
      visuals={visuals}
      onFiltersChange={setFilters}
      onPhysicsChange={setPhysics}
      onVisualsChange={setVisuals}
      onSelectNote={api.setActiveNoteId}
    />
  );

  const primaryPane = viewMode === 'graph' ? graphPane : editorPane;
  const secondaryPane =
    viewMode === 'graph' ? (
      <LocalGraphView
        notes={api.notes}
        activeNoteId={api.activeNoteId}
        physics={physics}
        visuals={visuals}
        onSelectNote={api.setActiveNoteId}
        onPhysicsChange={setPhysics}
        onVisualsChange={setVisuals}
      />
    ) : (
      graphPane
    );

  const inspectorPane = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <FrontmatterPanel
        note={api.activeNote}
        onChange={(frontmatter) => {
          if (api.activeNoteId) void api.updateFrontmatter(api.activeNoteId, frontmatter);
        }}
        onRenameTitle={(title) => {
          // Title edits run through the rename cascade so the note title, slug
          // and every referencing wikilink stay consistent.
          if (api.activeNoteId) void api.renameNote(api.activeNoteId, title);
        }}
        onSelectTag={(tag) => {
          setActiveTag(tag);
          setFilters((current) => ({ ...current, showTags: true }));
        }}
        className="rounded-lg border border-border bg-canvas"
      />

      <NoteMetadata
        note={api.activeNote}
        onSelectTag={(tag) => {
          setActiveTag(tag);
          setFilters((current) => ({ ...current, showTags: true }));
        }}
        onCopyLink={(note) => {
          void navigator.clipboard?.writeText(`[[${note.title}]]`).then(
            () => setToast('Wikilink copied'),
            () => setToast('Clipboard unavailable'),
          );
        }}
      />

      {api.activeNote ? (
        <>
          <BacklinksList
            backlinks={backlinks}
            activeNote={api.activeNote}
            allNotes={api.notes}
            onNavigate={api.setActiveNoteId}
            onConvertMention={(sourceId, targetTitle, mention) => {
              const source = notesById[sourceId];
              if (!source) return;
              const next = source.content.replace(mention, `[[${targetTitle}]]`);
              void api.updateNoteContent(sourceId, next);
              setToast('Mention converted to a link');
            }}
          />

          <OutgoingLinksList
            links={links.outgoing}
            activeNote={api.activeNote}
            notesById={notesById}
            onNavigate={api.setActiveNoteId}
            onCreateFromGhost={(title) => openNoteByTitle(title)}
          />
        </>
      ) : (
        <p className="text-xs text-text-subtle">{EMPTY_MESSAGE}</p>
      )}
    </div>
  );

  const sidebarPane = (
    <FileExplorer
      notes={api.notes}
      folders={api.folders}
      activeNoteId={api.activeNoteId}
      onSelectNote={(id) => {
        api.setActiveNoteId(id);
        setMobilePane('editor');
      }}
      onCreateNote={(folderId) => void api.createNote('Untitled', folderId)}
      onCreateFolder={(parentId) => void api.createFolder('New folder', parentId)}
      onRenameNote={(id) => {
        const note = notesById[id];
        if (note) setPendingRename({ kind: 'note', id, title: note.title });
      }}
      onTogglePin={(id) => void api.togglePin(id)}
      onDeleteNote={(id) => void api.deleteNote(id)}
      onRenameFolder={(id) => {
        const folder = api.folders.find((candidate) => candidate.id === id);
        if (folder) setPendingRename({ kind: 'folder', id, title: folder.name });
      }}
      onDeleteFolder={(id) => void api.deleteFolder(id)}
      linkCounts={api.linkCounts}
      backlinkCounts={api.backlinkCounts}
      tagCounts={api.tagCounts}
      activeTag={activeTag}
      onSelectTag={(tag) => {
        setActiveTag((current) => (current === tag ? null : tag));
        setFilters((current) => ({ ...current, showTags: true }));
      }}
    />
  );

  const searchPane = (
    <div className="flex h-full flex-col gap-3 p-3">
      <SearchBar
        ref={searchInputRef}
        value={searchQuery}
        onChange={setSearchQuery}
        hotkeyHint="⌘K"
        resultCount={searchResults.length}
      />

      {searchQuery.trim().length === 0 ? (
        <p className="text-xs text-text-subtle">
          Search titles, aliases, tags and content. Results update as you type.
        </p>
      ) : searchResults.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-text-subtle">
          No notes match “{searchQuery}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {searchResults.map((result) => (
            <li key={result.note.id}>
              <button
                type="button"
                onClick={() => {
                  api.setActiveNoteId(result.note.id);
                  setMobilePane('editor');
                }}
                data-testid={`search-result-${result.note.slug}`}
                className="flex w-full flex-col gap-1 rounded-lg border border-border bg-canvas p-2 text-left hover:border-node-cyan/50"
              >
                <span className="truncate text-sm text-text-main">{result.note.title}</span>
                {result.matches.map((match, index) => (
                  <span
                    key={`${match.field}-${index}`}
                    className={[
                      'line-clamp-2 text-[11px] leading-relaxed',
                      match.field === 'title' ? 'text-node-cyan' : 'text-text-muted',
                    ].join(' ')}
                  >
                    {match.snippet}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const mainPane = layout.isMobile ? (
    <div className="flex h-full min-h-0 flex-col">
      {mobilePane === 'editor' ? editorPane : null}
      {mobilePane === 'graph' ? graphPane : null}
      {mobilePane === 'search' ? searchPane : null}
      {mobilePane === 'explorer' ? sidebarPane : null}
      {mobilePane === 'inspector' ? inspectorPane : null}
    </div>
  ) : (
    <SplitPaneContainer
      viewMode={viewMode}
      primary={primaryPane}
      secondary={secondaryPane}
      showSecondary={inspectorOpen || viewMode === 'graph'}
    />
  );

  if (api.error) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center" role="alert">
        <div className="max-w-sm">
          <h1 className="text-base font-semibold text-node-rose">Storage error</h1>
          <p className="mt-1 text-sm text-text-muted">{api.error}</p>
          <Button
            variant="secondary"
            className="mt-3"
            leadingIcon={<RefreshCw />}
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppLayout
        layout={layout}
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        header={
          <AppHeader
            title={api.activeNote?.title ?? EMPTY_MESSAGE}
            breadcrumbs={breadcrumbs}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sidebarOpen={sidebarOpen}
            inspectorOpen={inspectorOpen}
            onToggleSidebar={() => {
              if (layout.isMobile) setMobilePane((pane) => (pane === 'explorer' ? 'editor' : 'explorer'));
              else setSidebarOpen((open) => !open);
            }}
            onToggleInspector={() => {
              if (layout.isMobile) setMobilePane((pane) => (pane === 'inspector' ? 'editor' : 'inspector'));
              else setInspectorOpen((open) => !open);
            }}
            onOpenQuickSwitcher={palette.openQuickSwitcher}
            onOpenCommandPalette={palette.openCommandPalette}
            onRenameTitle={(title) => {
              if (api.activeNoteId) void api.renameNote(api.activeNoteId, title);
            }}
            isMobile={layout.isMobile}
          />
        }
        sidebar={sidebarPane}
        main={mainPane}
        inspector={inspectorPane}
        bottomNav={
          layout.isMobile ? (
            <MobileNavBar
              activeView={mobilePane}
              onViewChange={setMobilePane}
              showLabels={layout.showsNavLabels}
            />
          ) : null
        }
      />

      {layout.isMobile ? (
        <>
          <MobileDrawer
            open={mobilePane === 'explorer'}
            side="left"
            title="File explorer"
            onClose={() => setMobilePane('editor')}
          >
            {sidebarPane}
          </MobileDrawer>

          <MobileDrawer
            open={mobilePane === 'inspector'}
            side="right"
            title="Backlinks & graph"
            onClose={() => setMobilePane('editor')}
          >
            {inspectorPane}
          </MobileDrawer>
        </>
      ) : null}

      <CommandPalette
        open={palette.isCommandPaletteOpen}
        onClose={palette.closeCommandPalette}
        actions={commandActions}
        notes={api.notes}
        onOpenNote={(id) => api.setActiveNoteId(id)}
      />

      <QuickSwitcherModal
        open={palette.isQuickSwitcherOpen}
        onClose={palette.closeQuickSwitcher}
        notes={api.notes}
        activeNoteId={api.activeNoteId}
        onSelect={(id) => api.setActiveNoteId(id)}
        onCreateNote={(title) => void api.createNote(title)}
      />

      <PromptDialog
        open={pendingRename !== null}
        title={pendingRename?.kind === 'folder' ? 'Rename folder' : 'Rename note'}
        label={pendingRename?.kind === 'folder' ? 'Folder name' : 'Note title'}
        description={
          pendingRename?.kind === 'note'
            ? 'Every [[wikilink]] pointing at this note is updated automatically.'
            : 'Notes inside the folder keep their place in the tree.'
        }
        initialValue={pendingRename?.title ?? ''}
        confirmLabel="Rename"
        validate={(value) => {
          if (pendingRename?.kind === 'note' && api.notes.some((note) => note.title === value)) {
            return 'A note with this title already exists';
          }
          return true;
        }}
        onCancel={() => setPendingRename(null)}
        onConfirm={async (value) => {
          if (!pendingRename) return;
          if (pendingRename.kind === 'note') await api.renameNote(pendingRename.id, value);
          else await api.renameFolder(pendingRename.id, value);
          setPendingRename(null);
          setToast(`Renamed to “${value}”`);
        }}
        testId="rename-dialog"
      />

      {/* Toolbar used by the palette: data import/export. */}
      <div className="fixed bottom-3 right-3 z-30 hidden flex-col gap-1 md:flex">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<FileDown />}
          onClick={() => void exportMarkdownFiles()}
          data-testid="export-markdown"
        >
          MD
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<FileUp />}
          onClick={() => fileInputRef.current?.click()}
          data-testid="import-markdown"
        >
          Import
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        hidden
        data-testid="import-markdown-input"
        onChange={(event) => {
          void handleImportFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="restore-backup-input"
        onChange={(event) => {
          void handleRestoreBackup(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {api.isReady ? null : (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
          <span className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening knowledge base…
          </span>
        </div>
      )}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="app-toast"
          className="fixed bottom-20 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-text-main shadow-lg md:bottom-6"
        >
          {toast}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X className="h-3.5 w-3.5 text-text-subtle" />
          </button>
        </div>
      ) : null}

      {/* Tag filters surfaced above the graph on small screens. */}
      {activeTag ? (
        <div className="pointer-events-none fixed left-1/2 top-16 z-30 -translate-x-1/2 md:hidden">
          <TagBadge
            tag={activeTag}
            active
            onClick={() => setActiveTag(null)}
            testId="active-tag-chip"
            className="pointer-events-auto shadow-lg"
          />
        </div>
      ) : null}
    </>
  );
};

export default App;