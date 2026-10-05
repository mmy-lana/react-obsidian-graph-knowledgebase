import React from 'react';
import { FileText, Link2, Network, PanelLeft, Search } from 'lucide-react';

export interface MobileNavBarProps {
  /** Active pane on mobile. */
  activeView: 'explorer' | 'search' | 'editor' | 'graph' | 'inspector';
  onViewChange: (view: MobileNavBarProps['activeView']) => void;
  /** 360px viewports hide the text labels to avoid wrapping. */
  showLabels?: boolean;
  className?: string;
  testId?: string;
}

interface NavItem {
  id: MobileNavBarProps['activeView'];
  label: string;
  icon: React.ReactNode;
}

/**
 * Fixed bottom navigation for viewports below `md`.
 * Icon-only below 390px, icon + 10px labels from 390px upwards.
 */
export function MobileNavBar({
  activeView,
  onViewChange,
  showLabels = true,
  className = '',
  testId = 'mobile-nav',
}: MobileNavBarProps) {
  const items: NavItem[] = [
    { id: 'explorer', label: 'Explorer', icon: <PanelLeft /> },
    { id: 'search', label: 'Search', icon: <Search /> },
    { id: 'editor', label: 'Edit', icon: <FileText /> },
    { id: 'graph', label: 'Graph', icon: <Network /> },
    { id: 'inspector', label: 'Links', icon: <Link2 /> },
  ];

  return (
    <nav
      className={[
        'z-40 flex shrink-0 items-stretch justify-around gap-0.5 border-t border-border bg-surface px-1 pt-1 pb-safe md:hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Primary"
      data-testid={testId}
      data-labels={showLabels ? 'visible' : 'sr-only'}
    >
      {items.map((item) => {
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            data-testid={`${testId}-${item.id}`}
            onClick={() => onViewChange(item.id)}
            className={[
              'flex min-h-12 min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors',
              active ? 'bg-node-cyan/15 text-node-cyan' : 'text-text-muted hover:text-text-main',
            ].join(' ')}
          >
            <span aria-hidden="true" className="[&_svg]:h-5 [&_svg]:w-5">
              {item.icon}
            </span>
            {showLabels ? (
              <span className="text-[10px] leading-none">{item.label}</span>
            ) : (
              <span className="sr-only">{item.label}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default MobileNavBar;