import { useCallback, useMemo, useState } from 'react';
import type { Note } from '../types/models';

export interface SuggestionMatch {
  title: string;
  slug: string;
  isExisting: boolean;
}

export interface WikilinkTriggerRange {
  start: number;
  end: number;
}

export interface WikilinkAutoComplete {
  isOpen: boolean;
  query: string;
  cursorPosition: { top: number; left: number };
  triggerRange: WikilinkTriggerRange;
  suggestions: SuggestionMatch[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  close: () => void;
  /**
   * Inspects the text before the caret and opens the popup when an unclosed
   * `[[` sequence is detected.
   *
   * @returns true when the popup should stay open.
   */
  handleEditorInput: (
    text: string,
    cursorOffset: number,
    coordCalculator: (offset: number) => { top: number; left: number },
  ) => boolean;
}

const MAX_SUGGESTIONS = 8;

/**
 * Wikilink auto-complete popup state and keyboard index.
 * Consumer contract: the parent editor controls dismissal on unmount or when
 * switching between source/preview modes.
 */
export function useWikilinkAutoComplete(notes: Note[]): WikilinkAutoComplete {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [triggerRange, setTriggerRange] = useState<WikilinkTriggerRange>({ start: 0, end: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const suggestions = useMemo<SuggestionMatch[]>(() => {
    if (!isOpen) return [];

    const cleanQuery = query.toLowerCase().trim();
    const existing = notes
      .filter((note) => note.title.toLowerCase().includes(cleanQuery))
      .map((note) => ({ title: note.title, slug: note.slug, isExisting: true }));

    const exactMatch = notes.some((note) => note.title.toLowerCase() === cleanQuery);
    if (!exactMatch && cleanQuery.length > 0) {
      existing.push({
        title: query,
        slug: query.toLowerCase().replace(/\s+/g, '-'),
        isExisting: false,
      });
    }

    return existing.slice(0, MAX_SUGGESTIONS);
  }, [notes, query, isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(0);
  }, []);

  const handleEditorInput = useCallback(
    (
      text: string,
      cursorOffset: number,
      coordCalculator: (offset: number) => { top: number; left: number },
    ): boolean => {
      const textBeforeCursor = text.slice(0, cursorOffset);
      const openIdx = textBeforeCursor.lastIndexOf('[[');
      const closeIdx = textBeforeCursor.lastIndexOf(']]');

      if (openIdx !== -1 && openIdx > closeIdx) {
        const rawQuery = textBeforeCursor.slice(openIdx + 2);
        if (!rawQuery.includes('\n')) {
          setIsOpen(true);
          setQuery(rawQuery);
          setTriggerRange({ start: openIdx, end: cursorOffset });
          setCursorPosition(coordCalculator(openIdx));
          setSelectedIndex(0);
          return true;
        }
      }

      setIsOpen(false);
      return false;
    },
    [],
  );

  return {
    isOpen,
    query,
    cursorPosition,
    triggerRange,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    close,
    handleEditorInput,
  };
}

export default useWikilinkAutoComplete;