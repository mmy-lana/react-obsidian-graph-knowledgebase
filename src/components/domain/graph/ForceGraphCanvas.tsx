import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { GraphControls } from './GraphControls';
import { useGraphSimulation, nodeColorFor, nodeRadiusFor } from '../../../hooks/useGraphSimulation';
import type {
  GraphFilterSettings,
  GraphNode,
  GraphPhysicsSettings,
  GraphVisualSettings,
  Note,
} from '../../../types/models';

export interface ForceGraphCanvasProps {
  notes: Note[];
  activeNoteId: string | null;
  filters: GraphFilterSettings;
  physics: GraphPhysicsSettings;
  visuals: GraphVisualSettings;
  onFiltersChange: (filters: GraphFilterSettings) => void;
  onPhysicsChange: (physics: GraphPhysicsSettings) => void;
  onVisualsChange: (visuals: GraphVisualSettings) => void;
  onSelectNote?: (noteId: string) => void;
  /** Scopes the graph to the active note's neighbourhood. */
  localOnly?: boolean;
  className?: string;
}

/**
 * High-DPI canvas renderer for the force-directed graph.
 *
 * Owns the resize observer, pointer gestures (pan, pinch zoom, node drag with
 * pinning), hit testing and the drawing of edges, nodes and labels.
 */
export function ForceGraphCanvas({
  notes,
  activeNoteId,
  filters,
  physics,
  visuals,
  onFiltersChange,
  onPhysicsChange,
  onVisualsChange,
  onSelectNote,
  localOnly = false,
  className = '',
}: ForceGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showControls, setShowControls] = useState(false);

  const simulation = useGraphSimulation({
    notes,
    filters,
    physics,
    visuals,
    activeNoteId,
    width: size.width,
    height: size.height,
    localOnly,
  });

  const {
    nodes,
    edges,
    zoom,
    offset,
    hoveredNodeId,
    selectedNodeId,
    neighborIds,
    paused,
    zoomBy,
    pan,
    resetView,
    centerOn,
    dragNode,
    setHoveredNode,
    selectNode,
    togglePaused,
    unpinAll,
    nearestNode,
  } = simulation;

  // Stable handle so the native wheel listener never needs re-binding.
  const zoomByRef = useRef(zoomBy);
  useEffect(() => {
    zoomByRef.current = zoomBy;
  }, [zoomBy]);

  // Pointer gesture bookkeeping.
  const gestureRef = useRef<{
    mode: 'idle' | 'pan' | 'drag' | 'pinch';
    nodeId: string | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pinchDistance: number;
  }>({
    mode: 'idle',
    nodeId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pinchDistance: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const toWorld = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - size.width / 2 - offset.x) / zoom,
      y: (screenY - size.height / 2 - offset.y) / zoom,
    }),
    [size.width, size.height, offset, zoom],
  );

  // Drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const toScreen = (node: GraphNode) => ({
      x: (node.x ?? 0) * zoom + offset.x + size.width / 2,
      y: (node.y ?? 0) * zoom + offset.y + size.height / 2,
    });

    const focusId = hoveredNodeId ?? selectedNodeId;
    const hasFocus = neighborIds.size > 0;
    const nodeIndex = new Map(nodes.map((node) => [node.id, node]));

    // Edges.
    context.lineWidth = 1;
    for (const edge of edges) {
      const source = nodeIndex.get(edge.source);
      const target = nodeIndex.get(edge.target);
      if (!source || !target) continue;

      const a = toScreen(source);
      const b = toScreen(target);
      const involved = focusId === edge.source || focusId === edge.target;

      context.strokeStyle = hasFocus
        ? involved
          ? visuals.highlightColor
          : 'rgba(51, 65, 85, 0.18)'
        : visuals.edgeColor;
      context.globalAlpha = hasFocus ? (involved ? 0.9 : 0.25) : 0.65;

      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    // Nodes.
    for (const node of nodes) {
      const position = toScreen(node);
      const radius = Math.max(nodeRadiusFor(node, visuals) * zoom, 2);
      const dimmed = hasFocus && !neighborIds.has(node.id);

      context.globalAlpha = dimmed ? 0.25 : 1;
      context.beginPath();
      context.arc(position.x, position.y, radius, 0, Math.PI * 2);
      context.fillStyle = nodeColorFor(node, visuals);
      context.fill();

      if (node.id === focusId || node.id === activeNoteId) {
        context.lineWidth = 2;
        context.strokeStyle = visuals.highlightColor;
        context.stroke();
      }
    }

    // Labels.
    if (visuals.showLabels) {
      context.globalAlpha = 1;
      context.font = `${Math.max(11, 12 * Math.min(zoom, 1.4))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'top';

      for (const node of nodes) {
        if (hasFocus && !neighborIds.has(node.id)) continue;
        if (zoom < 0.6 && node.val < 8) continue;

        const position = toScreen(node);
        const radius = Math.max(nodeRadiusFor(node, visuals) * zoom, 2);
        const label = node.title.length > 26 ? `${node.title.slice(0, 25)}…` : node.title;

        context.lineWidth = 3;
        context.strokeStyle = 'rgba(9, 13, 22, 0.85)';
        context.strokeText(label, position.x, position.y + radius + 4);
        context.fillStyle = node.id === focusId ? visuals.highlightColor : '#cbd5f5';
        context.fillText(label, position.x, position.y + radius + 4);
      }
    }

    context.globalAlpha = 1;
  }, [
    nodes,
    edges,
    zoom,
    offset,
    size.width,
    size.height,
    visuals,
    hoveredNodeId,
    selectedNodeId,
    neighborIds,
    activeNoteId,
    filters,
  ]);

  const pointerPosition = (
    event: Pick<React.PointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY'> & {
      currentTarget: HTMLCanvasElement;
    },
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const position = pointerPosition(event);
    const node = nearestNode(position.x, position.y);
    const gesture = gestureRef.current;

    gesture.startX = position.x;
    gesture.startY = position.y;
    gesture.lastX = position.x;
    gesture.lastY = position.y;
    gesture.nodeId = node?.id ?? null;
    gesture.mode = node ? 'drag' : 'pan';

    event.currentTarget.setPointerCapture(event.pointerId);
    if (node) selectNode(node.id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const position = pointerPosition(event);
    const gesture = gestureRef.current;

    if (gesture.mode === 'idle') {
      const hovered = nearestNode(position.x, position.y);
      setHoveredNode(hovered?.id ?? null);
      event.currentTarget.style.cursor = hovered ? 'grab' : 'default';
      return;
    }

    if (gesture.mode === 'pan') {
      pan(position.x - gesture.lastX, position.y - gesture.lastY);
    } else if (gesture.mode === 'drag' && gesture.nodeId) {
      const world = toWorld(position.x, position.y);
      dragNode(gesture.nodeId, world.x, world.y, true);
      event.currentTarget.style.cursor = 'grabbing';
    }

    gesture.lastX = position.x;
    gesture.lastY = position.y;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    const position = pointerPosition(event);
    const moved = Math.hypot(position.x - gesture.startX, position.y - gesture.startY);

    if (gesture.mode === 'drag' && gesture.nodeId && moved < 4) {
      const node = nodes.find((candidate) => candidate.id === gesture.nodeId);
      if (node && node.group === 'note') onSelectNote?.(node.id);
      else if (node?.group === 'unresolved') onSelectNote?.(node.id);
    }

    gesture.mode = 'idle';
    gesture.nodeId = null;
    event.currentTarget.style.cursor = 'default';
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /**
 * Wheel zooming is bound natively with `{ passive: false }`.
 *
 * React's synthetic `onWheel` is registered passively by the browser, so calling
 * `preventDefault()` there is ignored and logs a console warning.
 */
useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomByRef.current(event.deltaY < 0 ? 1.12 : 0.89);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();

    const [first, second] = Array.from(event.touches);
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    const gesture = gestureRef.current;

    if (gesture.pinchDistance > 0) {
      zoomBy(distance / gesture.pinchDistance);
    }
    gesture.pinchDistance = distance;
  };

  return (
    <div
      ref={containerRef}
      className={['relative h-full w-full overflow-hidden bg-canvas', className].filter(Boolean).join(' ')}
      data-testid="force-graph"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Knowledge graph with ${nodes.length} nodes and ${neighborIds.size > 0 ? neighborIds.size : nodes.length} visible connections`}
        data-testid="force-graph-canvas"
        data-node-count={nodes.length}
        data-zoom={zoom.toFixed(3)}
        data-paused={paused ? 'true' : 'false'}
        className="h-full w-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          gestureRef.current.mode = 'idle';
          setHoveredNode(null);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          gestureRef.current.pinchDistance = 0;
        }}
        onDoubleClick={(event) => {
          const position = pointerPosition(event);
          const node = nearestNode(position.x, position.y);
          if (node) centerOn(node.id);
        }}
      />

      {nodes.length === 0 ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center"
          data-testid="force-graph-empty"
        >
          <div>
            <p className="text-sm font-medium text-text-main">No notes match the current filters</p>
            <p className="mt-1 text-xs text-text-subtle">
              Adjust the graph filters or create a note to grow the network.
            </p>
          </div>
        </div>
      ) : null}

      {hoveredNodeId ? (
        <NodeTooltip
          node={nodes.find((node) => node.id === hoveredNodeId) ?? null}
          position={simulation.nodeScreenPosition(hoveredNodeId)}
        />
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 backdrop-blur-sm">
          <IconButton label="Zoom in" icon={<ZoomIn />} size="sm" onClick={() => zoomBy(1.2)} data-testid="graph-zoom-in" />
          <IconButton label="Zoom out" icon={<ZoomOut />} size="sm" onClick={() => zoomBy(0.83)} data-testid="graph-zoom-out" />
          <IconButton label="Reset view" icon={<RotateCcw />} size="sm" onClick={resetView} data-testid="graph-reset" />
          <IconButton
            label={paused ? 'Resume physics' : 'Pause physics'}
            icon={paused ? <Play /> : <Pause />}
            size="sm"
            active={paused}
            onClick={togglePaused}
            data-testid="graph-pause"
          />
          <IconButton
            label="Center on active note"
            icon={<Crosshair />}
            size="sm"
            onClick={() => activeNoteId && centerOn(activeNoteId)}
            disabled={!activeNoteId}
            data-testid="graph-center"
          />
          <IconButton
            label={showControls ? 'Hide graph settings' : 'Show graph settings'}
            icon={<Settings2 />}
            size="sm"
            active={showControls}
            onClick={() => setShowControls((value) => !value)}
            data-testid="graph-settings"
          />
        </div>

        {nodes.length > 0 ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2 py-1 text-[11px] tabular-nums text-text-subtle backdrop-blur-sm">
            <Maximize2 className="h-3 w-3" />
            {nodes.length} nodes
            <span aria-hidden="true">·</span>
            {Math.round(zoom * 100)}%
          </div>
        ) : null}
      </div>

      {showControls ? (
        <div className="absolute right-3 top-3 max-h-[min(70vh,28rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-surface/95 p-3 backdrop-blur-sm">
          <GraphControls
            filters={filters}
            physics={physics}
            visuals={visuals}
            onFiltersChange={onFiltersChange}
            onPhysicsChange={onPhysicsChange}
            onVisualsChange={onVisualsChange}
            onReset={() => {
              resetView();
              unpinAll();
            }}
            onClose={() => setShowControls(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function NodeTooltip({
  node,
  position,
}: {
  node: GraphNode | null;
  position: { x: number; y: number } | null;
}) {
  if (!node || !position) return null;

  const groupLabel =
    node.group === 'note' ? 'Note' : node.group === 'tag' ? 'Tag' : 'Unresolved link';

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[14rem] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-text-main shadow-lg"
      style={{ left: position.x, top: position.y }}
      data-testid="graph-node-tooltip"
      role="status"
    >
      <span className="block truncate font-medium">{node.title}</span>
      <span className="block text-text-subtle">
        {groupLabel} · weight {Math.round(node.val)}
      </span>
    </div>
  );
}

export default ForceGraphCanvas;