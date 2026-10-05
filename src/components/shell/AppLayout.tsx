import React from 'react';
import type { ResponsiveLayout } from '../../hooks/useResponsiveLayout';

export interface AppLayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  /** Central pane (editor or graph). */
  main: React.ReactNode;
  /** Right inspector column (backlinks + local graph). */
  inspector: React.ReactNode;
  bottomNav?: React.ReactNode;
  layout: ResponsiveLayout;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  className?: string;
  testId?: string;
}

/**
 * Responsive shell.
 *
 * - `< 768px`   : single pane; sidebar and inspector render as drawers driven by
 *                 the bottom navigation (provided by the parent).
 * - `768px–1023px`: sidebar collapses to an icon-width dock when closed.
 * - `>= 1024px` : three columns (explorer 260px | main | inspector 280px).
 */
export function AppLayout({
  header,
  sidebar,
  main,
  inspector,
  bottomNav,
  layout,
  sidebarOpen,
  inspectorOpen,
  className = '',
  testId = 'app-layout',
}: AppLayoutProps) {
  const { isMobile } = layout;

  const sidebarWidth = 'w-[240px]';
  const inspectorWidth = 'w-[280px]';

  return (
    <div
      className={['flex h-dvh w-full flex-col overflow-hidden bg-canvas', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-breakpoint={layout.breakpoint}
    >
      {header}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && sidebarOpen ? (
          <aside
            className={[
              'hidden shrink-0 overflow-y-auto border-r border-border md:block',
              sidebarWidth,
            ].join(' ')}
            data-testid={`${testId}-sidebar`}
          >
            {sidebar}
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden" data-testid={`${testId}-main`}>
          {main}
        </main>

        {!isMobile && inspectorOpen ? (
          <aside
            className={`hidden shrink-0 overflow-y-auto border-l border-border md:block ${inspectorWidth}`}
            data-testid={`${testId}-inspector`}
          >
            {inspector}
          </aside>
        ) : null}
      </div>

      {bottomNav}
    </div>
  );
}

export default AppLayout;