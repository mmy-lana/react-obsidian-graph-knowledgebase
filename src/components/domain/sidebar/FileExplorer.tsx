import { useEffect, useRef, useState } from 'react';
import { Pin, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DropdownMenu } from '../../ui/DropdownMenu';
import { TreeItem } from '../../molecules/TreeItem';
import { ConfirmDialog } from '../../molecules/ConfirmDialog';
import { FolderTree } from './FolderTree';
import { NewNoteButton } from './NewNoteButton';
import { TagExplorer } from './TagExplorer';
import type { Folder, Note } from '../../../types/models';

export interface FileExplorerProps {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameNote: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  /** Outgoing link count per note id. */
  linkCounts?: Record<string, number>;
  /** Backlink count per note id. */
  backlinkCounts?: Record<string, number>;
  /** Tag frequencies across all notes, used by the tag explorer tab. */
  tagCounts?: Record<string, number>;
  onSelectTag?: (tag: string) => void;
  activeTag?: string | null;
  className?: string;
}

interface PendingDeletion {
  kind: 'note' | 'folder';
  id: string;
  title: string;
}

/**
 * Left sidebar: pinned notes, nested folder tree and a tag explorer tab.
 * Mobile-first and fully operable without hover.
 */
export function FileExplorer({
  notes,
  folders,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onRenameNote,
  onTogglePin,
  onDeleteNote,
  onRenameFolder,
  onDeleteFolder,
  linkCounts = {},
  backlinkCounts = {},
  tagCounts = {},
  onSelectTag,
  activeTag = null,
  className = '',
}: FileExplorerProps) {
  const [tab, setTab] = useState<'files' | 'tags'>('files');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const bootstrappedRef = useRef(false);

  // The first render happens before the reactive query resolves, so folders are
  // expanded as soon as they actually arrive instead of staying collapsed.
  useEffect(() => {
    if (bootstrappedRef.current || folders.length === 0) return;
    bootstrappedRef.current = true;
    setExpandedIds(new Set(folders.map((folder) => folder.id)));
  }, [folders]);

  const toggleFolder = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pinnedNotes = notes
    .filter((note) => note.isPinned)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className={['flex h-full min-h-0 w-full flex-col bg-surface', className].filter(Boolean).join(' ')}
      aria-label="File explorer"
      data-testid="file-explorer"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border p-2">
        <NewNoteButton
          onCreateNote={onCreateNote}
          onCreateFolder={onCreateFolder}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
          className="flex-1"
        />

        <DropdownMenu
          label="File explorer actions"
          items={[
            {
              id: 'collapse',
              label: 'Collapse all folders',
              icon: <RotateCcw />,
              onSelect: () => setExpandedIds(new Set()),
            },
          ]}
          trigger={
            <Button
              variant="secondary"
              size="sm"
              aria-label="Collapse all folders"
              data-testid="explorer-actions"
              className="px-2"
            >
              ⋯
            </Button>
          }
        />
      </div>

      <div
        role="tablist"
        aria-label="Explorer sections"
        className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5"
      >
        {(['files', 'tags'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`explorer-tab-${id}`}
            className={[
              'min-h-9 flex-1 rounded-md text-xs font-medium transition-colors',
              tab === id ? 'bg-elevated text-text-main' : 'text-text-muted hover:text-text-main',
            ].join(' ')}
          >
            {id === 'files' ? 'Files' : 'Tags'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {tab === 'tags' ? (
          <TagExplorer
            tagCounts={tagCounts}
            activeTag={activeTag}
            onSelectTag={onSelectTag}
            compact
            testId="sidebar-tag-explorer"
          />
        ) : (
          <>
            {pinnedNotes.length > 0 ? (
              <section aria-label="Pinned notes" className="mb-2">
                <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                  Pinned
                </h3>
                <div className="flex flex-col gap-0.5">
                  {pinnedNotes.map((note) => (
                    <TreeItem
                      key={note.id}
                      id={note.id}
                      kind="note"
                      title={note.title}
                      active={note.id === activeNoteId}
                      pinned
                      linkCount={linkCounts[note.id] ?? 0}
                      backlinkCount={backlinkCounts[note.id] ?? 0}
                      onSelect={onSelectNote}
                      actions={[
                        { id: 'rename', label: 'Rename', onSelect: () => onRenameNote(note.id) },
                        { id: 'pin', label: 'Unpin note', icon: <Pin />, onSelect: () => onTogglePin(note.id) },
                        {
                          id: 'delete',
                          label: 'Delete note',
                          danger: true,
                          onSelect: () => setPendingDeletion({ kind: 'note', id: note.id, title: note.title }),
                        },
                      ]}
                      testId={`pinned-${note.id}`}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <FolderTree
              notes={notes.filter((note) => !note.isPinned)}
              folders={folders}
              expandedIds={expandedIds}
              activeNoteId={activeNoteId}
              onToggleFolder={toggleFolder}
              onSelectNote={onSelectNote}
              linkCounts={linkCounts}
              backlinkCounts={backlinkCounts}
              noteActions={(note) => [
                { id: 'rename', label: 'Rename', onSelect: () => onRenameNote(note.id) },
                {
                  id: 'pin',
                  label: 'Pin note',
                  icon: <Pin />,
                  onSelect: () => onTogglePin(note.id),
                },
                {
                  id: 'delete',
                  label: 'Delete note',
                  danger: true,
                  onSelect: () => setPendingDeletion({ kind: 'note', id: note.id, title: note.title }),
                },
              ]}
              folderActions={(folder) => [
                { id: 'note', label: 'New note here', onSelect: () => onCreateNote(folder.id) },
                { id: 'subfolder', label: 'New subfolder', onSelect: () => onCreateFolder(folder.id) },
                { id: 'rename', label: 'Rename folder', onSelect: () => onRenameFolder(folder.id) },
                {
                  id: 'delete',
                  label: 'Delete folder',
                  danger: true,
                  onSelect: () => setPendingDeletion({ kind: 'folder', id: folder.id, title: folder.name }),
                },
              ]}
              emptyState="No notes yet. Create your first note to start building the graph."
              testId="folder-tree"
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeletion !== null}
        title={pendingDeletion?.kind === 'folder' ? 'Delete folder' : 'Delete note'}
        confirmLabel="Delete"
        message={
          pendingDeletion ? (
            <>
              <strong className="text-text-main">{pendingDeletion.title}</strong> will be removed. Notes that
              link to it keep their content, but those links become unresolved.
            </>
          ) : null
        }
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => {
          if (!pendingDeletion) return;
          if (pendingDeletion.kind === 'note') onDeleteNote(pendingDeletion.id);
          else onDeleteFolder(pendingDeletion.id);
          setPendingDeletion(null);
        }}
        testId="file-explorer-confirm"
      />
    </aside>
  );
}

export default FileExplorer;