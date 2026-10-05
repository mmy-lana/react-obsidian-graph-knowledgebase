import { useState } from 'react';
import { ChevronRight, FileText, Folder, MoreVertical } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from '../ui/DropdownMenu';

export type TreeItemKind = 'note' | 'folder';

export interface TreeItemActionContext {
  id: string;
  kind: TreeItemKind;
  title: string;
}

export interface TreeItemProps {
  id: string;
  kind: TreeItemKind;
  title: string;
  /** Depth level used for indentation (0 = root). */
  depth?: number;
  /** Folders only: expanded state. */
  expanded?: boolean;
  /** Folders only: number of direct children. */
  childCount?: number;
  active?: boolean;
  pinned?: boolean;
  /** Notes only: outbound + inbound link counts rendered as badges. */
  linkCount?: number;
  backlinkCount?: number;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  actions?: DropdownMenuItem[];
  onActionsContext?: (context: TreeItemActionContext) => void;
  className?: string;
  testId?: string;
}

/**
 * One row of the file explorer: collapsible chevron for folders, note icon,
 * active highlight, link counters and a context menu.
 *
 * The whole row is a button (44px min height on touch) while the context menu
 * is a separate 44px trigger so both targets stay comfortably tappable.
 */
export function TreeItem({
  id,
  kind,
  title,
  depth = 0,
  expanded = false,
  childCount = 0,
  active = false,
  pinned = false,
  linkCount = 0,
  backlinkCount = 0,
  onSelect,
  onToggle,
  actions = [],
  onActionsContext,
  className = '',
  testId,
}: TreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isFolder = kind === 'folder';

  const label = title.trim().length > 0 ? title : 'Untitled';

  return (
    <div
      className={[
        'group flex items-center gap-1 rounded-md pr-1 transition-colors duration-150',
        active ? 'bg-node-cyan/10' : 'hover:bg-elevated/70',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
    >
      {isFolder ? (
        <button
          type="button"
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          onClick={() => onToggle?.(id)}
          className="flex h-11 w-6 shrink-0 items-center justify-center text-text-subtle hover:text-text-main md:h-8"
        >
          <ChevronRight
            className={['h-4 w-4 transition-transform duration-150', expanded ? 'rotate-90' : ''].join(' ')}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="w-6 shrink-0" />
      )}

      <button
        type="button"
        onClick={() => (isFolder ? onToggle?.(id) : onSelect?.(id))}
        aria-current={active ? 'true' : undefined}
        data-testid={testId ? `${testId}-select` : undefined}
        className={[
          'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 text-left text-sm md:min-h-8',
          active ? 'text-node-cyan' : 'text-text-muted hover:text-text-main',
        ].join(' ')}
      >
        {isFolder ? (
          <Folder className={['h-4 w-4 shrink-0', active ? 'text-node-cyan' : 'text-node-amber'].join(' ')} />
        ) : (
          <FileText
            className={['h-4 w-4 shrink-0', active ? 'text-node-cyan' : 'text-text-subtle'].join(' ')}
          />
        )}

        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>

        {pinned ? <span aria-label="Pinned" className="text-node-amber">★</span> : null}

        {!isFolder && backlinkCount > 0 ? (
          <span
            className="shrink-0 rounded-full bg-elevated px-1.5 text-[10px] tabular-nums text-text-subtle"
            title={`${backlinkCount} backlinks`}
          >
            {backlinkCount}
          </span>
        ) : null}

        {!isFolder && linkCount > 0 ? (
          <span
            className="shrink-0 rounded-full bg-elevated px-1.5 text-[10px] tabular-nums text-text-subtle"
            title={`${linkCount} outgoing links`}
          >
            {linkCount}
          </span>
        ) : null}

        {isFolder && childCount > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-text-subtle">{childCount}</span>
        ) : null}
      </button>

      {actions.length > 0 ? (
        <DropdownMenu
          label={`Actions for ${label}`}
          align="end"
          items={actions.map((action) => ({
            ...action,
            onSelect: () => {
              onActionsContext?.({ id, kind, title: label });
              action.onSelect();
            },
          }))}
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${label}`}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((value) => !value)}
              data-testid={testId ? `${testId}-menu` : undefined}
              className={[
                'flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-text-subtle',
                'hover:bg-elevated hover:text-text-main md:h-8',
                menuOpen ? 'bg-elevated text-text-main' : 'opacity-60 md:opacity-0 md:group-hover:opacity-100',
              ].join(' ')}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          }
        />
      ) : null}
    </div>
  );
}

export default TreeItem;