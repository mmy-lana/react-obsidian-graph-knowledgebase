import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip payload. Plain text or any renderable node. */
  content: React.ReactNode;
  /** Exactly one focusable/hoverable element. */
  children: React.ReactElement;
  placement?: TooltipPlacement;
  /** Hover intent delay in milliseconds. */
  delayMs?: number;
  /** Forces the tooltip off regardless of input modality. */
  disabled?: boolean;
  /** Extra classes for the floating bubble. */
  className?: string;
}

const PLACEMENT_CLASSES: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/** True when the primary pointer cannot hover (phones, tablets, stylus-less). */
export const isCoarsePointer = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/**
 * Hover/focus tooltip. Never appears on touch devices (where a hover state
 * cannot be dismissed) but stays available to keyboard users via `:focus-visible`.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  delayMs = 350,
  disabled = false,
  className = '',
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timerRef = useRef<number | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openWithDelay = useCallback(() => {
    if (disabled || isCoarsePointer()) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
  }, [clearTimer, delayMs, disabled]);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Reposition while open so scrolling or layout shifts keep the bubble anchored.
  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      const anchor = anchorRef.current;
      const bubble = bubbleRef.current;
      if (!anchor || !bubble) return;

      const rect = anchor.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const margin = 8;

      let top = 0;
      let left = 0;

      if (placement === 'top') {
        top = rect.top - bubbleRect.height - 8;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      } else if (placement === 'bottom') {
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      } else if (placement === 'left') {
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.left - bubbleRect.width - 8;
      } else {
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.right + 8;
      }

      setPosition({
        top: Math.max(margin, Math.min(top, window.innerHeight - bubbleRect.height - margin)),
        left: Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin)),
      });
    };

    reposition();

    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, placement]);

  const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;

  return (
    <>
      {React.cloneElement(child, {
        ref: (node: HTMLElement | null) => {
          anchorRef.current = node;
          const childRef = (child as unknown as { ref?: unknown }).ref;
          if (typeof childRef === 'function') (childRef as (n: HTMLElement | null) => void)(node);
        },
        onPointerEnter: (event: React.PointerEvent) => {
          (child.props.onPointerEnter as ((e: React.PointerEvent) => void) | undefined)?.(event);
          if (event.pointerType !== 'touch') openWithDelay();
        },
        onPointerLeave: (event: React.PointerEvent) => {
          (child.props.onPointerLeave as ((e: React.PointerEvent) => void) | undefined)?.(event);
          close();
        },
        onPointerDown: (event: React.PointerEvent) => {
          (child.props.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(event);
          close();
        },
        onFocus: (event: React.FocusEvent) => {
          (child.props.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(event);
          setOpen(true);
        },
        onBlur: (event: React.FocusEvent) => {
          (child.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(event);
          close();
        },
        'aria-describedby': open ? tooltipId : child.props['aria-describedby'],
      } as Partial<unknown>)}

      {open && content !== null && content !== undefined && content !== false
        ? createPortal(
            <div
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              style={{ top: position.top, left: position.left }}
              className={[
                'pointer-events-none fixed z-[70] max-w-[16rem] animate-pop-in',
                'rounded-md border border-border bg-elevated px-2 py-1',
                'text-xs leading-snug text-text-main shadow-lg shadow-black/40',
                PLACEMENT_CLASSES[placement],
                className,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default Tooltip;