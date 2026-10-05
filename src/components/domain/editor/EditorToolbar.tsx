import { useEffect, useRef } from 'react';
import { Bold, Code, Eye, Heading1, Italic, Link2, List, ListChecks, WrapText } from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { TabNavigation } from '../../molecules/TabNavigation';
import type { EditorMode } from '../../../types/models';

export interface EditorToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  /** Applies a formatting action to the editor selection. */
  onFormat: (action: EditorFormatAction) => void;
  disabled?: boolean;
  isSaving?: boolean;
}

export type EditorFormatAction =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'wikilink'
  | 'task'
  | 'bullet'
  | 'code'
  | 'quote';

interface FormatButtonConfig {
  action: EditorFormatAction;
  label: string;
  icon: React.ReactNode;
}

const FORMAT_BUTTONS: FormatButtonConfig[] = [
  { action: 'bold', label: 'Bold', icon: <Bold /> },
  { action: 'italic', label: 'Italic', icon: <Italic /> },
  { action: 'heading', label: 'Heading', icon: <Heading1 /> },
  { action: 'wikilink', label: 'Wikilink', icon: <Link2 /> },
  { action: 'task', label: 'Task item', icon: <ListChecks /> },
  { action: 'bullet', label: 'Bullet list', icon: <List /> },
  { action: 'code', label: 'Code block', icon: <Code /> },
  { action: 'quote', label: 'Blockquote', icon: <WrapText /> },
];

const MODES: Array<{ id: EditorMode; label: string; icon: React.ReactNode; shortcut?: string }> = [
  { id: 'source', label: 'Source', icon: <Code />, shortcut: '⌘E' },
  { id: 'live', label: 'Split', icon: <WrapText /> },
  { id: 'preview', label: 'Preview', icon: <Eye /> },
];

/**
 * Formatting controls for the markdown editor.
 *
 * The format row scrolls horizontally (`overflow-x-auto scrollbar-none
 * flex-nowrap shrink-0`) so buttons never wrap or shift the layout at 360px.
 */
export function EditorToolbar({
  mode,
  onModeChange,
  onFormat,
  disabled = false,
  isSaving = false,
}: EditorToolbarProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Keep the active mode button visible after a mode switch on small screens.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>('[data-tab-id][aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [mode]);

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-surface px-2 py-1.5">
      <div className="flex items-center gap-2">
        <TabNavigation
          label="Editor mode"
          activeTab={mode}
          onChange={onModeChange}
          tabs={MODES}
          className="min-w-0 flex-1"
          testId="editor-mode-tabs"
        />

        <span
          role="status"
          aria-live="polite"
          className="shrink-0 text-[10px] tabular-nums text-text-subtle"
          data-testid="editor-save-state"
        >
          {isSaving ? 'Saving…' : 'Saved'}
        </span>
      </div>

      <div
        ref={rowRef}
        className="flex shrink-0 flex-nowrap items-center gap-0.5 overflow-x-auto scrollbar-none"
        role="toolbar"
        aria-label="Formatting"
        data-testid="editor-toolbar"
      >
        {FORMAT_BUTTONS.map((button) => (
          <IconButton
            key={button.action}
            label={button.label}
            icon={button.icon}
            size="sm"
            disabled={disabled}
            onClick={() => onFormat(button.action)}
            data-testid={`editor-format-${button.action}`}
          />
        ))}
      </div>
    </div>
  );
}

export default EditorToolbar;