import { forwardRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Hotkey hint rendered inside the field, e.g. `Cmd+K`. */
  hotkeyHint?: string;
  /** Number of matches for the current query (undefined hides the counter). */
  resultCount?: number;
  autoFocus?: boolean;
  onSubmit?: (value: string) => void;
  className?: string;
  testId?: string;
}

/**
 * Search input with leading icon, debounce-friendly value binding, a clear
 * affordance and a keyboard shortcut hint.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    value,
    onChange,
    placeholder = 'Search notes…',
    hotkeyHint,
    resultCount,
    autoFocus = false,
    onSubmit,
    className = '',
    testId = 'search-bar',
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <form
      role="search"
      className={['relative flex w-full items-center', className].filter(Boolean).join(' ')}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value);
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 flex items-center text-text-subtle"
      >
        <Search className="h-4 w-4" />
      </span>

      <input
        ref={ref}
        type="search"
        role="searchbox"
        value={value}
        autoFocus={autoFocus}
        aria-label="Search notes"
        placeholder={placeholder}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        className={[
          'min-h-11 w-full rounded-lg border bg-canvas pl-9 text-sm text-text-main md:min-h-9',
          'placeholder:text-text-subtle transition-colors duration-150',
          'focus:outline-none focus:ring-1 focus:ring-node-cyan',
          '[&::-webkit-search-cancel-button]:appearance-none',
          value || hotkeyHint ? 'pr-20' : '',
          focused ? 'border-node-cyan/60' : 'border-border',
        ].join(' ')}
      />

      <div className="absolute right-1.5 flex items-center gap-1">
        {value ? (
          <IconButton
            label="Clear search"
            icon={<X />}
            size="sm"
            tooltip={false}
            onClick={() => onChange('')}
            data-testid="search-clear"
            className="h-7 w-7"
          />
        ) : null}

        {!value && hotkeyHint ? (
          <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-text-subtle">
            {hotkeyHint}
          </kbd>
        ) : null}
      </div>

      {typeof resultCount === 'number' && value.length > 0 ? (
        <span
          role="status"
          aria-live="polite"
          data-testid="search-count"
          className="absolute -bottom-5 left-0 text-[11px] text-text-subtle"
        >
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      ) : null}
    </form>
  );
});

export default SearchBar;