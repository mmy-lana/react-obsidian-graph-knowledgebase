import React, { useRef } from 'react';

export interface TabOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  /** Optional keyboard hint rendered on desktop. */
  shortcut?: string;
}

export interface TabNavigationProps<T extends string> {
  tabs: ReadonlyArray<TabOption<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
  testId?: string;
}

/**
 * Segmented tab control with a roving `tabindex` and full ARIA tablist
 * semantics: Left/Right arrows move between tabs, Home/End jump to the ends.
 */
export function TabNavigation<T extends string>({
  tabs,
  activeTab,
  onChange,
  label,
  className = '',
  testId = 'tab-navigation',
}: TabNavigationProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const move = (delta: number) => {
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    if (index === -1) return;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        onChange(tabs[0].id);
        listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${tabs[0].id}"]`)?.focus();
        break;
      case 'End': {
        event.preventDefault();
        const last = tabs[tabs.length - 1];
        onChange(last.id);
        listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${last.id}"]`)?.focus();
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={[
        'flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 scrollbar-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${testId}-tab-${tab.id}`}
            data-tab-id={tab.id}
            aria-selected={selected}
            aria-controls={`${testId}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={[
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors md:min-h-8',
              selected
                ? 'bg-elevated text-text-main'
                : 'text-text-muted hover:bg-elevated/60 hover:text-text-main',
            ].join(' ')}
          >
            {tab.icon ? (
              <span aria-hidden="true" className="flex items-center [&_svg]:h-4 [&_svg]:w-4">
                {tab.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.shortcut ? (
              <kbd className="hidden rounded bg-canvas px-1 text-[10px] text-text-subtle sm:inline">
                {tab.shortcut}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default TabNavigation;