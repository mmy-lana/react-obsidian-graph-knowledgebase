import React, { useCallback, useRef, useState } from 'react';
import type { ViewMode } from '../../types/models';

export interface SplitPaneContainerProps {
  viewMode: ViewMode;
  /** Left pane: editor (source/preview). */
  primary: React.ReactNode;
  /** Right pane: graph canvas or inspector, depends on `viewMode`. */
  secondary: React.ReactNode;
  /** Fraction (0.2–0.8) of the width given to the primary pane. */
  initialRatio?: number;
  onRatioChange?: (ratio: number) => void;
  /** Hides the draggable separator below the `md` breakpoint. */
  showSecondary?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Desktop split layout with a draggable separator.
 *
 * The separator is `hidden md:block`, uses `touch-action: none`, and provides a
 * 16px (`w-4`) transparent hit area around a 1px (`w-px`) visual line so the
 * divider is comfortable to grab without looking heavy.
 */
export function SplitPaneContainer({
  viewMode,
  primary,
  secondary,
  initialRatio = 0.55,
  onRatioChange,
  showSecondary = true,
  className = '',
  testId = 'split-pane',
}: SplitPaneContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const [dragging, setDragging] = useState(false);

  const applyRatio = useCallback(
    (next: number) => {
      const clamped = Math.min(0.8, Math.max(0.2, next));
      setRatio(clamped);
      onRatioChange?.(clamped);
    },
    [onRatioChange],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;
    applyRatio((event.clientX - rect.left) / rect.width);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      applyRatio(ratio - 0.02);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      applyRatio(ratio + 0.02);
    } else if (event.key === 'Home') {
      event.preventDefault();
      applyRatio(0.2);
    } else if (event.key === 'End') {
      event.preventDefault();
      applyRatio(0.8);
    }
  };

  const isSplit = viewMode === 'split' && showSecondary;

  return (
    <div
      ref={containerRef}
      className={['flex min-h-0 flex-1 overflow-hidden', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-view-mode={viewMode}
      data-split={isSplit ? 'true' : 'false'}
    >
      <div
        className="min-w-0 flex-1"
        style={isSplit ? { flexBasis: `${ratio * 100}%`, flexGrow: 0, flexShrink: 0 } : undefined}
        data-testid={`${testId}-primary`}
      >
        {primary}
      </div>

      {isSplit ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={20}
            aria-valuemax={80}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            data-testid={`${testId}-separator`}
            className="group relative hidden w-4 shrink-0 cursor-col-resize touch-none select-none items-center justify-center md:flex"
          >
            <span
              aria-hidden="true"
              className={[
                'w-px self-stretch transition-colors',
                dragging ? 'bg-node-cyan' : 'bg-border group-hover:bg-node-cyan/60',
              ].join(' ')}
            />
          </div>

          <div className="min-w-0 flex-1" data-testid={`${testId}-secondary`}>
            {secondary}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default SplitPaneContainer;