import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ForceDirectedSimulation } from '../services/graph/forceEngine';
import { buildKnowledgeGraph } from '../services/graph/graphBuilder';
import type {
  GraphFilterSettings,
  GraphNode,
  GraphPhysicsSettings,
  GraphVisualSettings,
  Note,
  RawGraphEdge,
} from '../types/models';

export interface GraphSimulationState {
  nodes: GraphNode[];
  /** Edges of the currently rendered graph (node id references). */
  edges: RawGraphEdge[];
  /** Currently hovered node id. */
  hoveredNodeId: string | null;
  /** Currently selected (clicked) node id. */
  selectedNodeId: string | null;
  /** Ids of nodes adjacent to the hovered/selected node. */
  neighborIds: Set<string>;
  isRunning: boolean;
  alpha: number;
  zoom: number;
  offset: { x: number; y: number };
  paused: boolean;

  zoomBy: (factor: number) => void;
  zoomAt: (factor: number, screenX?: number, screenY?: number) => void;
  resetView: () => void;
  pan: (deltaX: number, deltaY: number) => void;
  centerOn: (nodeId: string) => void;
  dragNode: (nodeId: string, x: number, y: number, pinned: boolean) => void;
  setHoveredNode: (nodeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  togglePaused: () => void;
  reheat: () => void;
  unpinAll: () => void;
  /** Screen coordinates for a node id, or `null` when off-canvas/unknown. */
  nodeScreenPosition: (nodeId: string) => { x: number; y: number } | null;
  nearestNode: (screenX: number, screenY: number, radius?: number) => GraphNode | null;
}

export interface UseGraphSimulationOptions {
  notes: Note[];
  filters: GraphFilterSettings;
  physics: GraphPhysicsSettings;
  /** Retained for callers that own the palette; colour mapping lives in the canvas. */
  visuals?: GraphVisualSettings;
  activeNoteId: string | null;
  width: number;
  height: number;
  /** Scopes the graph to the neighbourhood of the active note. */
  localOnly?: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Owns the canvas simulation lifecycle: data building, engine ticking, pan and
 * zoom state, hit testing and node dragging.
 */
export function useGraphSimulation({
  notes,
  filters,
  physics,
  activeNoteId,
  width,
  height,
  localOnly = false,
}: UseGraphSimulationOptions): GraphSimulationState {
  const simulationRef = useRef<ForceDirectedSimulation | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [alpha, setAlpha] = useState(1);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const graph = useMemo(
    () =>
      buildKnowledgeGraph(notes, localOnly ? { ...filters, maxDepth: 1 } : filters, activeNoteId),
    [notes, filters, activeNoteId, localOnly],
  );

  // Create the engine once and feed it dimensions/data/settings.
  useEffect(() => {
    const simulation = new ForceDirectedSimulation(width || 1, height || 1, physics);
    simulation.onTick((nextNodes) => {
      // Mutated in place by the engine; publish a shallow copy for React.
      setNodes([...nextNodes]);
      setAlpha(simulation.getAlpha());
    });
    simulationRef.current = simulation;

    return () => {
      simulation.destroy();
      simulationRef.current = null;
    };
    // The engine instance is stable; updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    simulationRef.current?.setDimensions(width || 1, height || 1);
  }, [width, height]);

  useEffect(() => {
    simulationRef.current?.setSettings(physics);
  }, [physics]);

  useEffect(() => {
    simulationRef.current?.setData(graph.nodes, graph.edges);
    setNodes([...graph.nodes]);
    setAlpha(1);
    simulationRef.current?.start();
  }, [graph]);

  const zoomAt = useCallback(
    (factor: number, screenX?: number, screenY?: number) => {
      setZoom((currentZoom) => {
        const nextZoom = clamp(currentZoom * factor, 0.25, 4);
        if (nextZoom === currentZoom) return currentZoom;

        const actualFactor = nextZoom / currentZoom;
        const focusX = screenX !== undefined ? screenX : width / 2;
        const focusY = screenY !== undefined ? screenY : height / 2;

        setOffset((currentOffset) => ({
          x: currentOffset.x * actualFactor + (focusX - width / 2) * (1 - actualFactor),
          y: currentOffset.y * actualFactor + (focusY - height / 2) * (1 - actualFactor),
        }));

        return nextZoom;
      });
    },
    [width, height],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      zoomAt(factor);
    },
    [zoomAt],
  );

  const pan = useCallback(
    (deltaX: number, deltaY: number) => {
      setOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
    },
    [],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    simulationRef.current?.unpinAll();
    simulationRef.current?.reheat(0.8);
  }, []);

  const centerOn = useCallback(
    (nodeId: string) => {
      const node = simulationRef.current?.findNode(nodeId);
      if (!node || node.x == null || node.y == null) return;
      setZoom((current) => {
        const targetZoom = clamp(current, 0.8, 2.2);
        setOffset({ x: -node.x! * targetZoom, y: -node.y! * targetZoom });
        return targetZoom;
      });
    },
    [],
  );

  const dragNode = useCallback((nodeId: string, x: number, y: number, pinned: boolean) => {
    simulationRef.current?.setNodePosition(nodeId, x, y, pinned);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      if (current) simulationRef.current?.start();
      else simulationRef.current?.stop();
      return !current;
    });
  }, []);

  const reheat = useCallback(() => simulationRef.current?.reheat(0.6), []);

  const nodeScreenPosition = useCallback(
    (nodeId: string) => {
      const node = simulationRef.current?.findNode(nodeId);
      if (!node || node.x == null || node.y == null) return null;
      return {
        x: node.x * zoom + offset.x + width / 2,
        y: node.y * zoom + offset.y + height / 2,
      };
    },
    [zoom, offset, width, height],
  );

  const nearestNode = useCallback(
    (screenX: number, screenY: number, radius = 24): GraphNode | null => {
      const worldX = (screenX - width / 2 - offset.x) / zoom;
      const worldY = (screenY - height / 2 - offset.y) / zoom;

      let best: GraphNode | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;
        const distance = Math.hypot((node.x ?? 0) - worldX, (node.y ?? 0) - worldY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = node;
        }
      }

      return bestDistance <= (radius / zoom) * 2 + (best?.val ?? 0) ? best : null;
    },
    [nodes, zoom, offset, width, height],
  );

  const neighborIds = useMemo(() => {
    const focusId = hoveredNodeId ?? selectedNodeId;
    if (!focusId) return new Set<string>();

    const ids = new Set<string>([focusId]);
    for (const edge of graph.edges) {
      if (edge.source === focusId) ids.add(edge.target);
      if (edge.target === focusId) ids.add(edge.source);
    }
    return ids;
  }, [hoveredNodeId, selectedNodeId, graph.edges]);

  const isRunning = !paused && (simulationRef.current?.isSimulating() ?? false);

  return {
    nodes,
    edges: graph.edges,
    hoveredNodeId,
    selectedNodeId,
    neighborIds,
    isRunning,
    alpha,
    zoom,
    offset,
    paused,
    zoomBy,
    zoomAt,
    resetView,
    pan,
    centerOn,
    dragNode,
    setHoveredNode: setHoveredNodeId,
    selectNode: setSelectedNodeId,
    togglePaused,
    reheat,
    unpinAll: useCallback(() => simulationRef.current?.unpinAll(), []),
    nodeScreenPosition,
    nearestNode,
  };
}

/** Marker colour for a node group, honouring the visual settings. */
export const nodeColorFor = (node: GraphNode, visuals: GraphVisualSettings): string => {
  if (node.group === 'unresolved') return visuals.unresolvedColor;
  if (node.group === 'tag') return visuals.tagColor;
  return visuals.nodeColor;
};

/** Maps `val` onto the configured radius range. */
export const nodeRadiusFor = (node: GraphNode, visuals: GraphVisualSettings): number => {
  const min = visuals.minNodeRadius;
  const max = visuals.maxNodeRadius;
  const span = Math.max(max - min, 0.001);
  return min + (clamp(node.val, 4, 18) - 4) / 14 * span;
};

export default useGraphSimulation;