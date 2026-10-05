import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ModalVariant = 'centered' | 'bottom-sheet';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** `bottom-sheet` slides up from the bottom edge (mobile default). */
  variant?: ModalVariant;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  /** Disables the Escape key handler (for critical confirmations). */
  disableEscape?: boolean;
  /** Convenience hook used by end-to-end checks; sets `data-testid`. */
  testId?: string;
  className?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  full: 'sm:max-w-[min(72rem,95vw)] sm:h-[90vh]',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Portal-rendered dialog with focus management, Escape handling, scroll lock,
 * and a mobile bottom-sheet presentation.
 *
 * The backdrop uses `bg-black/70 backdrop-blur-sm`, which stays cheap on
 * low-tier mobile GPUs compared with a large-radius blur.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'bottom-sheet',
  closeOnBackdrop = true,
  showCloseButton = true,
  disableEscape = false,
  testId,
  className = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableEscape) {
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        panel;
      target.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused.current?.focus?.();
    };
  }, [open, disableEscape, requestClose]);

  if (!open || typeof document === 'undefined') return null;

  const isSheet = variant === 'bottom-sheet';

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-[80] flex bg-black/70 backdrop-blur-sm',
        isSheet ? 'items-end' : 'items-center justify-center p-4',
      ].join(' ')}
      data-testid="modal-root"
    >
      <div
        className="absolute inset-0 animate-fade-in"
        onClick={closeOnBackdrop ? requestClose : undefined}
        onPointerDown={closeOnBackdrop ? requestClose : undefined}
        data-testid="modal-backdrop"
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-modal-panel="true"
        data-testid={testId ?? 'modal-panel'}
        className={[
          'relative z-10 flex w-full flex-col overflow-hidden border border-border bg-surface text-text-main',
          'shadow-2xl shadow-black/60 outline-none',
          isSheet
            ? 'max-h-[88vh] animate-sheet-up rounded-t-2xl pb-safe sm:mx-auto sm:max-h-[85vh] sm:rounded-2xl sm:pb-0'
            : 'animate-pop-in rounded-2xl',
          SIZE_CLASSES[size],
          className,
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {title || showCloseButton ? (
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              {title ? (
                <h2 id={titleId} className="truncate text-base font-semibold text-text-main">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p id={descriptionId} className="mt-0.5 text-xs text-text-muted">
                  {description}
                </p>
              ) : null}
            </div>

            {showCloseButton ? (
              <IconButton
                label="Close dialog"
                icon={<X />}
                variant="ghost"
                size="sm"
                className="-mr-1 -mt-1"
                tooltip={false}
                onClick={requestClose}
                data-testid="modal-close"
              />
            ) : null}
          </header>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-border bg-surface/80 px-4 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;