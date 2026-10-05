import { useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { ForceGraphCanvas } from './ForceGraphCanvas';
import { GraphLegend } from './GraphLegend';
import { TabNavigation } from '../../molecules/TabNavigation';
import { Button } from '../../ui/Button';
import { buildKnowledgeGraph } from '../../../services/graph/graphBuilder';
import type {
  GraphFilterSettings,
  GraphPhysicsSettings,
  GraphVisualSettings,
  Note,
} from '../../../types/models';

export interface LocalGraphViewProps {
  notes: Note[];
  activeNoteId: string | null;
  physics: GraphPhysicsSettings;
  visuals: GraphVisualSettings;
  onSelectNote: (noteId: string) => void;
  onFiltersChange?: (filters: GraphFilterSettings) => void;
  onPhysicsChange?: (physics: GraphPhysicsSettings) => void;
  onVisualsChange?: (visuals: GraphVisualSettings) => void;
  className?: string;
  testId?: string;
}

const DEFAULT_FILTERS: GraphFilterSettings = {
  showOrphans: true,
  showTags: false,
  showUnresolved: true,
  searchQuery: '',
  maxDepth: 2,
};

/**
 * Neighbourhood view of the active note.
 *
 * Depth 1 shows immediate neighbours, depth 2 the wider cluster, and depth 0
 * falls back to the whole vault — useful when nothing is selected yet.
 */
export function LocalGraphView({
  notes,
  activeNoteId,
  physics,
  visuals,
  onSelectNote,
  onFiltersChange,
  onPhysicsChange = () => undefined,
  onVisualsChange = () => undefined,
  className = '',
  testId = 'local-graph',
}: LocalGraphViewProps) {
  const [depth, setDepth] = useState<1 | 2>(1);
  const [filters, setFilters] = useState<GraphFilterSettings>(DEFAULT_FILTERS);

  const effectiveFilters = useMemo<GraphFilterSettings>(
    () => ({ ...filters, maxDepth: activeNoteId ? depth : 0 }),
    [filters, depth, activeNoteId],
  );

  const updateFilters = (next: GraphFilterSettings) => {
    setFilters(next);
    onFiltersChange?.(next);
  };

  const counts = useMemo(() => {
    if (!activeNoteId) return { notes: notes.length, tags: 0, unresolved: 0 };

    const graph = buildKnowledgeGraph(notes, { ...DEFAULT_FILTERS, showTags: true, maxDepth: depth }, activeNoteId);
    return {
      notes: graph.nodes.filter((node) => node.group === 'note').length,
      tags: graph.nodes.filter((node) => node.group === 'tag').length,
      unresolved: graph.nodes.filter((node) => node.group === 'unresolved').length,
    };
  }, [notes, activeNoteId, depth]);

  return (
    <section
      className={['relative flex h-full min-h-0 flex-col', className].filter(Boolean).join(' ')}
      aria-label="Local graph"
      data-testid={testId}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-1.5">
        <TabNavigation
          label="Graph depth"
          activeTab={depth === 1 ? '1' : '2'}
          onChange={(value) => setDepth(value === '1' ? 1 : 2)}
          tabs={[
            { id: '1', label: '1 hop' },
            { id: '2', label: '2 hops' },
          ]}
          testId="local-graph-depth"
        />

        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Network />}
          onClick={() => updateFilters({ ...effectiveFilters, showTags: !effectiveFilters.showTags })}
          testId="local-graph-toggle-tags"
        >
          {effectiveFilters.showTags ? 'Hide tags' : 'Show tags'}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <ForceGraphCanvas
          notes={notes}
          activeNoteId={activeNoteId}
          filters={effectiveFilters}
          physics={physics}
          visuals={visuals}
          localOnly
          onFiltersChange={updateFilters}
          onPhysicsChange={onPhysicsChange}
          onVisualsChange={onVisualsChange}
          onSelectNote={onSelectNote}
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
        <GraphLegend visuals={visuals} counts={counts} />
      </div>
    </section>
  );
}

export default LocalGraphView;