import React from 'react';
import type { DropdownMenuItem } from '../../ui/DropdownMenu';
import { TreeItem } from '../../molecules/TreeItem';
import type { Folder, Note } from '../../../types/models';

export interface FolderTreeProps {
  notes: Note[];
  folders: Folder[];
  /** Ids of expanded folders. */
  expandedIds: ReadonlySet<string>;
  activeNoteId: string | null;
  onToggleFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  noteActions?: (note: Note) => DropdownMenuItem[];
  folderActions?: (folder: Folder) => DropdownMenuItem[];
  linkCounts?: Record<string, number>;
  backlinkCounts?: Record<string, number>;
  /** Root-level notes that are not pinned (pinned notes render separately). */
  rootNotes?: Note[];
  emptyState?: React.ReactNode;
  className?: string;
  testId?: string;
}

function sortByTitle(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.title.localeCompare(b.title));
}

function childFolders(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recursive folder/note tree. Each level renders its folders first, then the
 * notes contained in that folder, so the structure mirrors the filesystem.
 */
export function FolderTree({
  notes,
  folders,
  expandedIds,
  activeNoteId,
  onToggleFolder,
  onSelectNote,
  noteActions,
  folderActions,
  linkCounts = {},
  backlinkCounts = {},
  rootNotes = [],
  emptyState = null,
  className = '',
  testId = 'folder-tree',
}: FolderTreeProps) {
  const visited = new Set<string>();

  const renderNote = (note: Note, depth: number): React.ReactNode => (
    <TreeItem
      key={note.id}
      id={note.id}
      kind="note"
      title={note.title}
      depth={depth}
      active={note.id === activeNoteId}
      pinned={note.isPinned}
      linkCount={linkCounts[note.id] ?? 0}
      backlinkCount={backlinkCounts[note.id] ?? 0}
      onSelect={onSelectNote}
      actions={noteActions ? noteActions(note) : []}
      testId={`note-${note.id}`}
    />
  );

  const renderFolder = (folder: Folder, depth: number): React.ReactNode => {
    if (visited.has(folder.id)) return null;
    visited.add(folder.id);

    const expanded = expandedIds.has(folder.id);
    const folderNotes = sortByTitle(notes.filter((note) => note.folderId === folder.id));
    const subFolders = childFolders(folders, folder.id);

    return (
      <React.Fragment key={folder.id}>
        <TreeItem
          id={folder.id}
          kind="folder"
          title={folder.name}
          depth={depth}
          expanded={expanded}
          childCount={folderNotes.length + subFolders.length}
          onToggle={onToggleFolder}
          actions={folderActions ? folderActions(folder) : []}
          testId={`folder-${folder.id}`}
        />

        {expanded ? (
          <>
            {subFolders.map((child) => renderFolder(child, depth + 1))}
            {folderNotes.map((note) => renderNote(note, depth + 1))}
          </>
        ) : null}
      </React.Fragment>
    );
  };

  const topLevel = childFolders(folders, null);
  const looseRootNotes = sortByTitle(notes.filter((note) => note.folderId === null && !note.isPinned));

  return (
    <div className={['flex flex-col gap-0.5', className].filter(Boolean).join(' ')} data-testid={testId}>
      {topLevel.map((folder) => renderFolder(folder, 0))}

      {rootNotes.map((note) => renderNote(note, 0))}
      {looseRootNotes.map((note) => renderNote(note, 0))}

      {notes.length === 0 && emptyState ? (
        <div className="px-2 py-6 text-center text-xs text-text-subtle">{emptyState}</div>
      ) : null}
    </div>
  );
}

export default FolderTree;