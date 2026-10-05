import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  /** Accessible name of the menu, also used as the trigger's aria-haspopup label. */
  label: string;
  trigger: React.ReactElement;
  items: DropdownMenuItem[];
  /** Optional non-interactive heading rendered above the items. */
  header?: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
}

const VIEWPORT_MARGIN = 8;

/**
 * Anchored menu rendered in a portal. Flips above the trigger when there is not
 * enough room below, clamps horizontally inside the viewport, and closes on
 * outside press, Escape, scroll, or resize — including touch interaction.
 */
export function DropdownMenu({
  label,
  trigger,
  items,
  header,
  align = 'start',
  className = '',
  menuClassName = '',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'bottom' as 'bottom' | 'top' });
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const reposition = useCallback(() => {
    const anchor = triggerRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < menuRect.height + VIEWPORT_MARGIN && rect.top > spaceBelow;

    setPosition({
      top: flip ? Math.max(VIEWPORT_MARGIN, rect.top - menuRect.height - 4) : rect.bottom + 4,
      left:
        align === 'end'
          ? rect.right - menuRect.width
          : rect.left,
      placement: flip ? 'top' : 'bottom',
    });
  }, [align]);

  useEffect(() => {
    if (!open) return;

    // Runs after the portal commit, so the menu box is measurable here.
    reposition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        triggerRef.current?.focus?.();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, close, reposition]);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentPosition = enabledIndexes.indexOf(activeIndex);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextPosition =
        currentPosition === -1
          ? delta > 0
            ? 0
            : enabledIndexes.length - 1
          : (currentPosition + delta + enabledIndexes.length) % enabledIndexes.length;
      const nextIndex = enabledIndexes[nextPosition];
      setActiveIndex(nextIndex);
      menuRef.current?.querySelector<HTMLElement>(`[data-index="${nextIndex}"]`)?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (activeIndex >= 0) {
        event.preventDefault();
        const item = items[activeIndex];
        if (item && !item.disabled) {
          close();
          item.onSelect();
        }
      }
    }
  };

  const triggerElement = trigger as React.ReactElement<Record<string, unknown>>;

  return (
    <div className={['relative inline-flex', className].filter(Boolean).join(' ')}>
      {React.cloneElement(triggerElement, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          const childRef = (trigger as unknown as { ref?: unknown }).ref;
          if (typeof childRef === 'function') (childRef as (n: HTMLElement | null) => void)(node);
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        'aria-label': (triggerElement.props['aria-label'] as string | undefined) ?? label,
        onClick: (event: React.MouseEvent) => {
          const handler = triggerElement.props.onClick as
            | ((e: React.MouseEvent) => void)
            | undefined;
          handler?.(event);
          setOpen((value) => !value);
        },
      } as Partial<unknown>)}

      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              data-placement={position.placement}
              data-testid="dropdown-menu"
              style={{ top: position.top, left: position.left }}
              onKeyDown={onMenuKeyDown}
              className={[
                'fixed z-[75] min-w-[12rem] animate-pop-in overflow-hidden rounded-lg',
                'border border-border bg-elevated py-1 shadow-xl shadow-black/50',
                menuClassName,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {header ? (
                <div className="border-b border-border px-3 py-2 text-xs font-medium text-text-subtle">
                  {header}
                </div>
              ) : null}

              {items.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-subtle">No actions available</p>
              ) : (
                <ul className="max-h-[min(60vh,20rem)] overflow-y-auto">
                  {items.map((item, index) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        data-index={index}
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.disabled) return;
                          close();
                          item.onSelect();
                        }}
                        onPointerEnter={() => setActiveIndex(index)}
                        className={[
                          'flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                          'transition-colors duration-100 md:min-h-0',
                          item.disabled
                            ? 'cursor-not-allowed text-text-subtle/60'
                            : item.danger
                              ? 'text-node-rose hover:bg-node-rose/15'
                              : 'text-text-main hover:bg-node-cyan/10',
                          activeIndex === index && !item.disabled ? 'bg-node-cyan/10' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {item.icon ? (
                          <span aria-hidden="true" className="flex shrink-0 items-center [&_svg]:h-4 [&_svg]:w-4">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.shortcut ? (
                          <kbd className="rounded bg-canvas px-1.5 py-0.5 text-[10px] text-text-subtle">
                            {item.shortcut}
                          </kbd>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default DropdownMenu;

/** Convenience trigger button used across the app shell. */
export const DropdownTriggerButton: React.FC<{
  label: string;
  className?: string;
}> = ({ label, className }) => (
  <button
    type="button"
    className={[
      'inline-flex min-h-11 items-center gap-1 rounded-lg border border-border bg-elevated px-2.5',
      'text-xs text-text-muted transition-colors hover:text-text-main md:min-h-8',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {label}
    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
  </button>
);