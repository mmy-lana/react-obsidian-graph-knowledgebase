import React, { useMemo } from 'react';
import {
  CircleDot,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderPlus,
  Network,
  RefreshCw,
  Tags,
  Type,
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Badge } from '../../ui/Badge';
import type { GraphFilterSettings } from '../../../types/models';

export type CommandPaletteActionId =
  | 'new-note'
  | 'new-folder'
  | 'toggle-sidebar'
  | 'toggle-inspector'
  | 'toggle-graph-tags'
  | 'toggle-graph-unresolved'
  | 'toggle-graph-orphans'
  | 'toggle-labels'
  | 'clear-filters'
  | 'export-json';

export interface CommandPaletteAction {
  id: CommandPaletteActionId;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  group: 'Create' | 'Layout' | 'Graph' | 'Data';
  /** Current on/off state for toggles. */
  active?: boolean;
  run: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
  /** Filter on note titles; entries are highlighted and can be opened. */
  notes?: Array<{ id: string; title: string; slug: string }>;
  onOpenNote?: (noteId: string) => void;
  /** Label shown in the modal header. */
  title?: string;
  testId?: string;
}

interface FlatRow {
  kind: 'command' | 'note';
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Command palette (Cmd/Ctrl+P): fuzzy filter over commands and note titles,
 * arrow-key navigation, Enter to run.
 */
export function CommandPalette({
  open,
  onClose,
  actions,
  notes = [],
  onOpenNote,
  title = 'Command palette',
  testId = 'command-palette',
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const rows = useMemo<FlatRow[]>(() => {
    const commandRows: FlatRow[] = actions.map((action) => ({
      kind: 'command',
      id: action.id,
      label: action.label,
      hint: action.active === undefined ? (action.description ?? action.shortcut ?? '') : action.active ? 'On' : 'Off',
      run: () => {
        void action.run();
        onClose();
      },
    }));

    const noteRows: FlatRow[] =
      onOpenNote === undefined
        ? []
        : notes.map((note) => ({
            kind: 'note',
            id: note.id,
            label: note.title,
            hint: `/${note.slug}`,
            run: () => {
              onOpenNote(note.id);
              onClose();
            },
          }));

    const term = normalize(query);
    if (!term) return [...commandRows, ...noteRows];

    const scored = [...commandRows, ...noteRows]
      .map((row) => ({ row, score: scoreRow(row.label, row.hint, term) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.row.label.localeCompare(b.row.label));

    return scored.map((entry) => entry.row);
  }, [actions, notes, onOpenNote, query, onClose]);

  const clampedIndex = Math.min(selectedIndex, Math.max(rows.length - 1, 0));

  const runSelected = () => {
    const row = rows[clampedIndex];
    if (row) row.run();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (rows.length === 0 ? 0 : (index + 1) % rows.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (rows.length === 0 ? 0 : (index - 1 + rows.length) % rows.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runSelected();
    }
  };

  const renderRow = (row: FlatRow, index: number) => {
    const action = actions.find((candidate) => candidate.id === row.id);
    return (
      <li key={`${row.kind}-${row.id}`}>
        <button
          type="button"
          role="option"
          aria-selected={index === clampedIndex}
          data-testid={`${testId}-row-${row.kind}-${row.id}`}
          onPointerEnter={() => setSelectedIndex(index)}
          onClick={row.run}
          className={[
            'flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm md:min-h-0',
            index === clampedIndex ? 'bg-node-cyan/15 text-text-main' : 'text-text-muted hover:bg-elevated',
          ].join(' ')}
        >
          <span aria-hidden="true" className="flex shrink-0 items-center [&_svg]:h-4 [&_svg]:w-4">
            {row.kind === 'command' && action ? action.icon : row.kind === 'note' ? <CircleDot /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{row.label}</span>
            {row.hint ? <span className="block truncate text-[10px] text-text-subtle">{row.hint}</span> : null}
          </span>
          {row.kind === 'command' && action?.shortcut ? (
            <kbd className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] text-text-subtle">
              {action.shortcut}
            </kbd>
          ) : null}
          {row.kind === 'command' && action?.active !== undefined ? (
            <Badge tone={action.active ? 'success' : 'neutral'} size="sm">
              {action.active ? 'On' : 'Off'}
            </Badge>
          ) : null}
        </button>
      </li>
    );
  };

  const commandRows = rows.filter((row) => row.kind === 'command');
  const noteRows = rows.filter((row) => row.kind === 'note');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Search commands and notes"
      variant="bottom-sheet"
      size="lg"
      testId={testId}
      className="sm:mt-0"
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${testId}-listbox`}
          aria-activedescendant={rows[clampedIndex] ? `${testId}-row-${rows[clampedIndex].kind}-${rows[clampedIndex].id}` : undefined}
          aria-label="Command palette search"
          placeholder="Type a command or note title…"
          value={query}
          autoFocus
          data-autofocus
          data-testid={`${testId}-input`}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onKeyDown}
          className={[
            'min-h-11 w-full rounded-lg border border-border bg-canvas px-3 text-base md:text-sm',
            'text-text-main placeholder:text-text-subtle focus:border-node-cyan/60',
            'focus:outline-none focus:ring-1 focus:ring-node-cyan',
          ].join(' ')}
        />

        {rows.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-text-subtle" data-testid={`${testId}-empty`}>
            No commands or notes match “{query}”.
          </p>
        ) : (
          <ul
            id={`${testId}-listbox`}
            role="listbox"
            aria-label="Commands"
            data-testid={`${testId}-list`}
            className="max-h-[min(50vh,22rem)] overflow-y-auto"
          >
            {commandRows.length > 0 ? (
              <>
                <li className="px-2 py-1 text-[10px] uppercase tracking-wider text-text-subtle" aria-hidden="true">
                  Commands
                </li>
                {commandRows.map((row) => renderRow(row, rows.indexOf(row)))}
              </>
            ) : null}

            {noteRows.length > 0 ? (
              <>
                <li className="px-2 py-1 text-[10px] uppercase tracking-wider text-text-subtle" aria-hidden="true">
                  Notes
                </li>
                {noteRows.map((row) => renderRow(row, rows.indexOf(row)))}
              </>
            ) : null}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/**
 * Subsequence match with a bonus for word-prefix hits, so `gnt` ranks
 * "Graph Theory & Network Thinking" above an incidental match.
 */
function scoreRow(label: string, hint: string, term: string): number {
  const target = normalize(label);
  const haystack = `${target} ${normalize(hint)}`;

  if (target === term) return 1000;
  if (target.startsWith(term)) return 800 - target.length;
  const wordStart = target.split(/[\s\-&]+/).some((word) => word.startsWith(term));
  if (wordStart) return 600 - target.length;

  let score = 0;
  let index = 0;
  for (const character of term) {
    const found = haystack.indexOf(character, index);
    if (found === -1) return 0;
    score += found === index ? 12 : 4;
    index = found + 1;
  }
  return score;
}

/** Default command set shared by the shell and the mobile command button. */
export function buildDefaultCommandActions(options: {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onToggleGraphTags: () => void;
  onToggleGraphUnresolved: () => void;
  onToggleGraphOrphans: () => void;
  onToggleLabels: () => void;
  onClearFilters: () => void;
  onExport: () => void;
  filters: GraphFilterSettings;
  showLabels: boolean;
}): CommandPaletteAction[] {
  return [
    {
      id: 'new-note',
      label: 'Create new note',
      description: 'Untitled note at the vault root',
      icon: <FilePlus2 />,
      shortcut: '⌘N',
      group: 'Create',
      run: options.onCreateNote,
    },
    {
      id: 'new-folder',
      label: 'Create new folder',
      icon: <FolderPlus />,
      group: 'Create',
      run: options.onCreateFolder,
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle file explorer',
      icon: <Eye />,
      group: 'Layout',
      run: options.onToggleSidebar,
    },
    {
      id: 'toggle-inspector',
      label: 'Toggle backlinks inspector',
      icon: <EyeOff />,
      group: 'Layout',
      run: options.onToggleInspector,
    },
    {
      id: 'toggle-graph-tags',
      label: 'Show tag nodes in graph',
      icon: <Tags />,
      group: 'Graph',
      active: options.filters.showTags,
      run: options.onToggleGraphTags,
    },
    {
      id: 'toggle-graph-unresolved',
      label: 'Show unresolved link ghosts',
      icon: <Network />,
      group: 'Graph',
      active: options.filters.showUnresolved,
      run: options.onToggleGraphUnresolved,
    },
    {
      id: 'toggle-graph-orphans',
      label: 'Show orphan notes',
      icon: <CircleDot />,
      group: 'Graph',
      active: options.filters.showOrphans,
      run: options.onToggleGraphOrphans,
    },
    {
      id: 'toggle-labels',
      label: 'Show graph node labels',
      icon: <Type />,
      group: 'Graph',
      active: options.showLabels,
      run: options.onToggleLabels,
    },
    {
      id: 'clear-filters',
      label: 'Clear graph filters and search',
      icon: <RefreshCw />,
      group: 'Graph',
      run: options.onClearFilters,
    },
    {
      id: 'export-json',
      label: 'Export vault as JSON backup',
      icon: <Download />,
      group: 'Data',
      run: options.onExport,
    },
  ];
}

export default CommandPalette;