import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export interface MobileDrawerProps {
  open: boolean;
  side: 'left' | 'right';
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Width of the sheet (percentage of the viewport). */
  widthPercent?: number;
  className?: string;
  testId?: string;
}

const SWIPE_THRESHOLD = 56;

/**
 * Touch-swipeable side sheet with a backdrop scrim.
 *
 * Dragging the sheet towards its edge (or tapping the scrim) dismisses it, so
 * the drawer is fully operable without hover affordances.
 */
export function MobileDrawer({
  open,
  side,
  title,
  onClose,
  children,
  widthPercent = 82,
  className = '',
  testId = 'mobile-drawer',
}: MobileDrawerProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (side === 'left' && deltaX < -SWIPE_THRESHOLD) handleClose();
    if (side === 'right' && deltaX > SWIPE_THRESHOLD) handleClose();
    if (Math.abs(deltaY) > SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) handleClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" data-testid={`${testId}-root`}>
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        data-testid={`${testId}-scrim`}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        data-testid={testId}
        data-side={side}
        data-open="true"
        style={{ width: `${widthPercent}%` }}
        className={[
          'absolute inset-y-0 flex flex-col bg-surface shadow-2xl shadow-black/60',
          'pb-safe',
          side === 'left'
            ? 'left-0 animate-sheet-up border-r border-border'
            : 'right-0 animate-sheet-up border-l border-border',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="truncate text-sm font-semibold text-text-main">{title}</h2>
          <IconButton
            label={`Close ${title.toLowerCase()}`}
            icon={<X />}
            size="sm"
            tooltip={false}
            onClick={handleClose}
            data-testid={`${testId}-close`}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

export default MobileDrawer;