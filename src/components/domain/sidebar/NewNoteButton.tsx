import { FolderPlus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DropdownMenu, type DropdownMenuItem } from '../../ui/DropdownMenu';

export interface NewNoteButtonProps {
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  /** Folders offered in the overflow menu (flat list, root first). */
  folders?: Array<{ id: string; name: string }>;
  className?: string;
  testId?: string;
}

/**
 * Primary "New Note" action with an overflow menu for creating notes inside a
 * specific folder and for creating new folders.
 */
export function NewNoteButton({
  onCreateNote,
  onCreateFolder,
  folders = [],
  className = '',
  testId = 'new-note-button',
}: NewNoteButtonProps) {
  const items: DropdownMenuItem[] = [
    { id: 'folder', label: 'New folder', icon: <FolderPlus />, onSelect: () => onCreateFolder(null) },
    ...folders.map((folder) => ({
      id: `note-in-${folder.id}`,
      label: `New note in ${folder.name}`,
      onSelect: () => onCreateNote(folder.id),
    })),
  ];

  return (
    <div className={['flex items-center gap-1', className].filter(Boolean).join(' ')}>
      <Button
        variant="primary"
        size="sm"
        className="flex-1"
        onClick={() => onCreateNote(null)}
        testId={testId}
      >
        New Note
      </Button>

      <DropdownMenu
        label="Create options"
        align="end"
        items={items}
        header="Quick create"
        trigger={
          <button
            type="button"
            aria-label="More create options"
            aria-haspopup="menu"
            data-testid={`${testId}-menu`}
            className="flex h-11 w-9 items-center justify-center rounded-md border border-border bg-elevated text-text-muted hover:text-text-main md:h-8"
          >
            +
          </button>
        }
      />
    </div>
  );
}

export default NewNoteButton;