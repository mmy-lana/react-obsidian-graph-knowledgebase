import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, FilePlus2 } from 'lucide-react';
import type { SuggestionMatch } from '../../hooks/useWikilinkAutoComplete';

export interface WikilinkSuggestPopoverProps {
  open: boolean;
  suggestions: SuggestionMatch[];
  selectedIndex: number;
  /** Cursor coordinates in viewport space (desktop popover placement). */
  cursorPosition: { top: number; left: number };
  query: string;
  onSelect: (suggestion: SuggestionMatch) => void;
  onHighlight: (index: number) => void;
  onClose: () => void;
  /** Forces the bottom drawer layout (touch devices). */
  isTouch?: boolean;
  testId?: string;
}

const MAX_VISIBLE = 8;

/**
 * Wikilink autocomplete surface.
 *
 * Desktop (`pointer: fine`) renders a floating popover anchored to the cursor;
 * touch/mobile renders a fixed bottom action drawer so thumbs can reach the
 * suggestions without precise cursor positioning.
 */
export function WikilinkSuggestPopover({
  open,
  suggestions,
  selectedIndex,
  cursorPosition,
  query,
  onSelect,
  onHighlight,
  onClose,
  isTouch = false,
  testId = 'wikilink-popover',
}: WikilinkSuggestPopoverProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number }>(cursorPosition);

  useLayoutEffect(() => {
    if (!open || isTouch) return;

    const element = listRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, cursorPosition.left - rect.width / 2),
      window.innerWidth - rect.width - margin,
    );
    const belowFits = cursorPosition.top + rect.height + 12 < window.innerHeight;
    const top = belowFits ? cursorPosition.top + rect.height + 8 : Math.max(margin, cursorPosition.top - rect.height - 8);

    setPlacement({ top, left });
  }, [open, isTouch, cursorPosition, suggestions.length]);

  useEffect(() => {
    if (!open) return;

    const list = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    list?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex]);

  if (!open || suggestions.length === 0) return null;

  const surfaceClass = isTouch
    ? 'fixed inset-x-0 bottom-0 z-[85] animate-sheet-up rounded-t-2xl border-t border-border bg-elevated/95 pb-safe backdrop-blur-sm'
    : 'fixed z-[85] animate-pop-in rounded-lg border border-border bg-elevated/95 shadow-xl shadow-black/50 backdrop-blur-sm';

  return createPortal(
    <div
      className={surfaceClass}
      style={isTouch ? undefined : { top: placement.top, left: placement.left }}
      data-testid={testId}
      data-layout={isTouch ? 'drawer' : 'popover'}
      role="listbox"
      aria-label="Wikilink suggestions"
    >
      {isTouch ? (
        <div className="flex items-center justify-center gap-1.5 pb-1 pt-2" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
      ) : null}

      <ul ref={listRef} className="max-h-[min(50vh,18rem)] overflow-y-auto p-1">
        {suggestions.slice(0, MAX_VISIBLE).map((suggestion, index) => (
          <li key={`${suggestion.slug}-${index}`}>
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              data-testid={`${testId}-option-${index}`}
              onPointerEnter={() => onHighlight(index)}
              onClick={() => onSelect(suggestion)}
              className={[
                'flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm',
                'transition-colors duration-100 md:min-h-0',
                index === selectedIndex ? 'bg-node-cyan/15 text-text-main' : 'text-text-muted hover:bg-elevated',
              ].join(' ')}
            >
              {suggestion.isExisting ? (
                <span className="flex-1 truncate">{suggestion.title}</span>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-node-cyan" />
                  <span className="truncate">Create new note: {query.trim() || 'Untitled'}</span>
                </span>
              )}

              {index === selectedIndex ? (
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="flex min-h-11 w-full items-center justify-center border-t border-border text-[11px] text-text-subtle hover:text-text-main md:min-h-0 md:py-1.5"
      >
        Esc to dismiss
      </button>
    </div>,
    document.body,
  );
}

export default WikilinkSuggestPopover;