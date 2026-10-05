import { useMemo, useState } from 'react';
import { Hash, Search } from 'lucide-react';
import { TagBadge } from '../../molecules/TagBadge';
import { Input } from '../../ui/Input';

export interface TagExplorerProps {
  /** Tag name (without `#`) mapped to the number of notes using it. */
  tagCounts: Record<string, number>;
  activeTag?: string | null;
  onSelectTag?: (tag: string) => void;
  /** Renders the standalone sidebar variant. */
  compact?: boolean;
  className?: string;
  testId?: string;
}

/** Aggregated `#tag` list with per-tag note counts and an inline filter. */
export function TagExplorer({
  tagCounts,
  activeTag = null,
  onSelectTag,
  compact = false,
  className = '',
  testId = 'tag-explorer',
}: TagExplorerProps) {
  const [filter, setFilter] = useState('');

  const tags = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return Object.entries(tagCounts)
      .filter(([tag]) => (query ? tag.toLowerCase().includes(query) : true))
      .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b));
  }, [tagCounts, filter]);

  return (
    <div className={['flex flex-col gap-2', className].filter(Boolean).join(' ')} data-testid={testId}>
      <Input
        size="sm"
        hideLabel
        label="Filter tags"
        placeholder="Filter tags…"
        leadingIcon={compact ? <Hash /> : <Search />}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        testId="tag-filter"
        className="[&::-webkit-search-cancel-button]:appearance-none"
      />

      {tags.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-text-subtle">
          {Object.keys(tagCounts).length === 0
            ? 'No tags yet. Add #tags inside notes to group them here.'
            : 'No tags match your filter.'}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" data-testid={`${testId}-list`}>
          {tags.map(([tag, count]) => (
            <li key={tag}>
              <TagBadge
                tag={tag}
                count={count}
                active={activeTag === tag}
                size={compact ? 'sm' : 'md'}
                onClick={onSelectTag}
                testId={`tag-pill-${tag}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TagExplorer;