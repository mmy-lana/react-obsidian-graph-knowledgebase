import { useCallback, useEffect, useState } from 'react';

export interface CommandPaletteState {
  isCommandPaletteOpen: boolean;
  isQuickSwitcherOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  closeAll: () => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

/**
 * Global keyboard shortcuts:
 *   Cmd/Ctrl+P → command palette, Cmd/Ctrl+O → quick switcher,
 *   Cmd/Ctrl+E → toggle editor/preview, Cmd/Ctrl+G → toggle graph view,
 *   Cmd/Ctrl+K → focus search.
 *
 * Shortcuts are ignored while the user is typing in a field, except for the
 * palette/switcher combos which intentionally take precedence (matching the
 * behaviour of Obsidian and VS Code).
 */
export function useCommandPalette(options: {
  onToggleEditor?: () => void;
  onToggleGraph?: () => void;
  onFocusSearch?: () => void;
  onCreateNote?: () => void;
}): CommandPaletteState {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isQuickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  const openCommandPalette = useCallback(() => {
    setQuickSwitcherOpen(false);
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  const openQuickSwitcher = useCallback(() => {
    setCommandPaletteOpen(false);
    setQuickSwitcherOpen(true);
  }, []);

  const closeQuickSwitcher = useCallback(() => setQuickSwitcherOpen(false), []);

  const closeAll = useCallback(() => {
    setCommandPaletteOpen(false);
    setQuickSwitcherOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      if (key === 'p') {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (key === 'o') {
        event.preventDefault();
        openQuickSwitcher();
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (key === 'e') {
        event.preventDefault();
        options.onToggleEditor?.();
      } else if (key === 'g') {
        event.preventDefault();
        options.onToggleGraph?.();
      } else if (key === 'k') {
        event.preventDefault();
        options.onFocusSearch?.();
      } else if (key === 'n') {
        event.preventDefault();
        options.onCreateNote?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    openCommandPalette,
    openQuickSwitcher,
    options.onToggleEditor,
    options.onToggleGraph,
    options.onFocusSearch,
    options.onCreateNote,
  ]);

  return {
    isCommandPaletteOpen,
    isQuickSwitcherOpen,
    openCommandPalette,
    closeCommandPalette,
    openQuickSwitcher,
    closeQuickSwitcher,
    closeAll,
  };
}

export default useCommandPalette;