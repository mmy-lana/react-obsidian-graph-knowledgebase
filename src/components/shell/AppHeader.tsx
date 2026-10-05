import React from 'react';
import { FileText, Menu, PanelRight, Search, Sidebar } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import type { ViewMode } from '../../types/models';

export interface AppHeaderProps {
  title: string;
  /** Breadcrumb trail, e.g. `Foundations / Graph Theory`. */
  breadcrumbs: string[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenCommandPalette: () => void;
  onRenameTitle?: (title: string) => void;
  onSearch?: (query: string) => void;
  isMobile?: boolean;
  testId?: string;
}

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: 'editor', label: 'Editor' },
  { id: 'split', label: 'Split' },
  { id: 'graph', label: 'Graph' },
];

/**
 * Top bar: explorer toggle + breadcrumbs on the left, inline title in the
 * centre, view mode / inspector / search actions on the right.
 */
export function AppHeader({
  title,
  breadcrumbs,
  viewMode,
  onViewModeChange,
  sidebarOpen,
  inspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  onOpenQuickSwitcher,
  onOpenCommandPalette,
  onRenameTitle,
  onSearch,
  isMobile = false,
  testId = 'app-header',
}: AppHeaderProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);

  React.useEffect(() => {
    setDraft(title);
  }, [title]);

  const commitTitle = () => {
    setEditing(false);
    const next = draft.trim();
    if (next.length > 0 && next !== title) onRenameTitle?.(next);
    else setDraft(title);
  };

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2"
      data-testid={testId}
    >
      <IconButton
        label={sidebarOpen ? 'Hide file explorer' : 'Show file explorer'}
        icon={<Menu />}
        active={sidebarOpen}
        onClick={onToggleSidebar}
        data-testid="header-toggle-sidebar"
      />

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-xs md:flex">
        {breadcrumbs.length === 0 ? (
          <span className="truncate text-text-subtle">Vault</span>
        ) : (
          breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb}-${index}`}>
              {index > 0 ? <span className="text-text-subtle">/</span> : null}
              <span className={index === breadcrumbs.length - 1 ? 'text-text-muted' : 'text-text-subtle'}>
                {crumb}
              </span>
            </React.Fragment>
          ))
        )}
      </nav>

      <div className="flex min-w-0 flex-1 items-center justify-center">
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="Note title"
            data-testid="header-title-input"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
            className="min-h-9 w-full max-w-md rounded-md border border-node-cyan/60 bg-canvas px-2 text-sm text-text-main focus:outline-none focus:ring-1 focus:ring-node-cyan"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid="header-title"
            className={[
              'flex min-h-11 max-w-full items-center gap-1.5 truncate rounded-md px-2 text-sm md:min-h-8',
              'font-medium text-text-main hover:bg-elevated',
            ].join(' ')}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-node-cyan" />
            <span className="truncate">{title || 'No note selected'}</span>
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div
          role="radiogroup"
          aria-label="View mode"
          className="hidden items-center gap-0.5 rounded-lg border border-border bg-canvas p-0.5 sm:flex"
          data-testid="header-view-mode"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={viewMode === option.id}
              data-testid={`header-view-${option.id}`}
              onClick={() => onViewModeChange(option.id)}
              className={[
                'min-h-8 rounded-md px-2 text-xs transition-colors',
                viewMode === option.id ? 'bg-elevated text-text-main' : 'text-text-muted hover:text-text-main',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isMobile ? (
          <IconButton
            label="Switch view mode"
            icon={<Sidebar />}
            onClick={() => onViewModeChange(viewMode === 'graph' ? 'editor' : 'graph')}
            data-testid="header-mobile-view"
          />
        ) : null}

        {onSearch ? (
          <IconButton
            label="Search notes"
            icon={<Search />}
            onClick={onOpenCommandPalette}
            data-testid="header-search"
          />
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenQuickSwitcher}
          className="hidden md:inline-flex"
          data-testid="header-quick-switcher"
        >
          Quick switcher
          <kbd className="ml-1 rounded bg-canvas px-1 text-[10px] text-text-subtle">⌘O</kbd>
        </Button>

        <IconButton
          label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          icon={<PanelRight />}
          active={inspectorOpen}
          onClick={onToggleInspector}
          data-testid="header-toggle-inspector"
        />
      </div>
    </header>
  );
}

export default AppHeader;