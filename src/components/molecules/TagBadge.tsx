import { Hash } from 'lucide-react';
import { Badge, type BadgeTone } from '../ui/Badge';

export interface TagBadgeProps {
  /** Tag name without the leading `#`. */
  tag: string;
  /** Number of notes carrying this tag. */
  count?: number;
  active?: boolean;
  tone?: BadgeTone;
  /** Filters the graph or the search results. */
  onClick?: (tag: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  testId?: string;
}

/** Clickable `#tag` pill used by the tag explorer, preview and search results. */
export function TagBadge({
  tag,
  count,
  active = false,
  tone = 'purple',
  onClick,
  size = 'md',
  className = '',
  testId,
}: TagBadgeProps) {
  const label = tag.startsWith('#') ? tag.slice(1) : tag;

  return (
    <Badge
      tone={tone}
      size={size}
      active={active}
      onClick={onClick ? () => onClick(label) : undefined}
      className={className}
      testId={testId}
      title={count !== undefined ? `#${label} · ${count} ${count === 1 ? 'note' : 'notes'}` : `#${label}`}
      icon={onClick ? <Hash /> : undefined}
    >
      {label}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </Badge>
  );
}

export default TagBadge;