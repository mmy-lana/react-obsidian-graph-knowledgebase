import { X } from 'lucide-react';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { IconButton } from '../../ui/IconButton';
import { Button } from '../../ui/Button';
import type {
  GraphFilterSettings,
  GraphPhysicsSettings,
  GraphVisualSettings,
} from '../../../types/models';

export interface GraphControlsProps {
  filters: GraphFilterSettings;
  physics: GraphPhysicsSettings;
  visuals: GraphVisualSettings;
  onFiltersChange: (filters: GraphFilterSettings) => void;
  onPhysicsChange: (physics: GraphPhysicsSettings) => void;
  onVisualsChange: (visuals: GraphVisualSettings) => void;
  onReset: () => void;
  onClose?: () => void;
  className?: string;
}

/**
 * Physics sliders plus visibility toggles for the graph.
 * Every control is labelled, keyboard operable and shows a live readout.
 */
export function GraphControls({
  filters,
  physics,
  visuals,
  onFiltersChange,
  onPhysicsChange,
  onVisualsChange,
  onReset,
  onClose,
  className = '',
}: GraphControlsProps) {
  return (
    <section
      className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}
      aria-label="Graph controls"
      data-testid="graph-controls"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">Graph settings</h3>
        {onClose ? (
          <IconButton label="Close graph settings" icon={<X />} size="sm" tooltip={false} onClick={onClose} />
        ) : null}
      </header>

      <div className="flex flex-col gap-2.5">
        <Slider
          label="Force strength"
          description="Repulsion between every pair of nodes"
          min={500}
          max={12000}
          step={100}
          value={physics.chargeStrength}
          formatValue={(value) => value.toLocaleString()}
          testId="slider-charge"
          onChange={(value) => onPhysicsChange({ ...physics, chargeStrength: value })}
        />
        <Slider
          label="Link distance"
          description="Preferred distance between linked nodes"
          min={40}
          max={260}
          step={5}
          value={physics.linkDistance}
          formatValue={(value) => `${value}px`}
          testId="slider-link-distance"
          onChange={(value) => onPhysicsChange({ ...physics, linkDistance: value })}
        />
        <Slider
          label="Link strength"
          description="How firmly links pull nodes together"
          min={0.01}
          max={0.3}
          step={0.01}
          value={physics.linkStrength}
          formatValue={(value) => value.toFixed(2)}
          testId="slider-link-strength"
          onChange={(value) => onPhysicsChange({ ...physics, linkStrength: value })}
        />
        <Slider
          label="Collision radius"
          description="Extra padding kept between nodes"
          min={0}
          max={40}
          step={1}
          value={physics.collisionRadius}
          formatValue={(value) => `${value}px`}
          testId="slider-collision"
          onChange={(value) => onPhysicsChange({ ...physics, collisionRadius: value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Switch
          label="Show orphans"
          description="Notes without any link"
          checked={filters.showOrphans}
          testId="switch-orphans"
          onChange={(checked) => onFiltersChange({ ...filters, showOrphans: checked })}
        />
        <Switch
          label="Show tags"
          description="Render #tags as connected nodes"
          checked={filters.showTags}
          testId="switch-tags"
          onChange={(checked) => onFiltersChange({ ...filters, showTags: checked })}
        />
        <Switch
          label="Show unresolved"
          description="Ghost nodes for missing link targets"
          checked={filters.showUnresolved}
          testId="switch-unresolved"
          onChange={(checked) => onFiltersChange({ ...filters, showUnresolved: checked })}
        />
        <Switch
          label="Show labels"
          description="Draw note titles next to nodes"
          checked={visuals.showLabels}
          testId="switch-labels"
          onChange={(checked) => onVisualsChange({ ...visuals, showLabels: checked })}
        />
      </div>

      <Button variant="ghost" size="sm" fullWidth onClick={onReset} testId="graph-controls-reset">
        Reset view &amp; unpin nodes
      </Button>
    </section>
  );
}

export default GraphControls;