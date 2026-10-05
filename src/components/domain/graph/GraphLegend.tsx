import type { GraphVisualSettings } from '../../../types/models';

export interface GraphLegendProps {
  visuals: GraphVisualSettings;
  counts: { notes: number; tags: number; unresolved: number };
  className?: string;
}

interface LegendEntry {
  color: string;
  label: string;
  count: number;
}

/** Colour key for the three node groups. */
export function GraphLegend({ visuals, counts, className = '' }: GraphLegendProps) {
  const entries: LegendEntry[] = [
    { color: visuals.nodeColor, label: 'Notes', count: counts.notes },
    { color: visuals.tagColor, label: 'Tags', count: counts.tags },
    { color: visuals.unresolvedColor, label: 'Unresolved', count: counts.unresolved },
  ];

  return (
    <ul
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 text-[11px] text-text-muted backdrop-blur-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Graph legend"
      data-testid="graph-legend"
    >
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.label}</span>
          <span className="tabular-nums text-text-subtle">{entry.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default GraphLegend;