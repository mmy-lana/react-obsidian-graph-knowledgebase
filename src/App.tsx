import React, { useState } from 'react';
import { Network, FileText, PanelLeftClose, PanelRightClose, Search } from 'lucide-react';

export const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'editor' | 'graph' | 'split'>('split');

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-canvas)] text-[var(--color-text-main)]">
      <header className="flex h-12 w-full shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-main)]"
            aria-label="Toggle Sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <Network className="h-4 w-4 text-[var(--color-node-cyan)]" />
            <span>Obsidian Graph</span>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded bg-[var(--color-canvas)] p-1 text-xs">
          <button
            onClick={() => setViewMode('editor')}
            className={`rounded px-2.5 py-1 transition-colors ${
              viewMode === 'editor'
                ? 'bg-[var(--color-elevated)] text-[var(--color-text-main)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`rounded px-2.5 py-1 transition-colors ${
              viewMode === 'split'
                ? 'bg-[var(--color-elevated)] text-[var(--color-text-main)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            Split
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`rounded px-2.5 py-1 transition-colors ${
              viewMode === 'graph'
                ? 'bg-[var(--color-elevated)] text-[var(--color-text-main)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
            }`}
          >
            Graph
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-elevated)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
            aria-label="Quick Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="rounded bg-[var(--color-canvas)] px-1.5 py-0.5 text-[10px]">Ctrl+K</kbd>
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-main)]"
            aria-label="Toggle Inspector"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Files &amp; Folders
            </div>
            <div className="flex flex-col gap-1 text-sm text-[var(--color-text-muted)]">
              <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[var(--color-text-main)] hover:bg-[var(--color-elevated)]">
                <FileText className="h-4 w-4 text-[var(--color-node-cyan)]" />
                <span>Welcome Note</span>
              </div>
              <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--color-elevated)]">
                <FileText className="h-4 w-4 text-[var(--color-node-purple)]" />
                <span>Graph Theory</span>
              </div>
            </div>
          </aside>
        )}

        <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--color-canvas)]">
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--color-text-muted)]">
            <div>
              <Network className="mx-auto mb-3 h-10 w-10 text-[var(--color-node-cyan)] opacity-70" />
              <p className="font-medium text-[var(--color-text-main)]">Knowledge Base Initialized</p>
              <p className="mt-1 text-xs text-[var(--color-text-subtle)]">Ready for domain component assembly</p>
            </div>
          </div>
        </main>

        {rightPanelOpen && (
          <aside className="w-72 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
              Backlinks &amp; Graph Info
            </div>
            <p className="text-xs text-[var(--color-text-subtle)]">No active note selected.</p>
          </aside>
        )}
      </div>
    </div>
  );
};

export default App;
