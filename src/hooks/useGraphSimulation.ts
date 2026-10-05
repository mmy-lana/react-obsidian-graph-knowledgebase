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
  /** Frames the whole graph inside the canvas viewport with padding. */
  fitToView: (paddingRatio?: number) => void;
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

/** Lowest and highest camera scale. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/**
 * Cooling floor that marks the layout as settled.
 *
 * Matches the engine's `alphaMin`: at or below it the engine stops ticking, so
 * the bounding box being framed is final and will not drift afterwards.
 */
const SETTLED_ALPHA = 0.001;

/** World point kept under the pointer when the camera zooms. */
interface Point {
  x: number;
  y: number;
}

/**
 * Camera transform, held as one value so zoom and offset always commit together.
 */
interface Camera {
  zoom: number;
  offset: Point;
}

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
  const nodesRef = useRef<GraphNode[]>([]);
  const hasAutoCenteredRef = useRef(false);
  /** Set once the user pans or zooms, which ends settle-time auto-framing. */
  const cameraTouchedRef = useRef(false);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [alpha, setAlpha] = useState(1);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState<Camera>({ zoom: 1, offset: { x: 0, y: 0 } });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Read-only projections of the camera for callers that consume one axis only.
  const { zoom, offset } = camera;

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
      nodesRef.current = nextNodes;
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
    nodesRef.current = graph.nodes;
    setNodes([...graph.nodes]);
    setAlpha(1);
    simulationRef.current?.start();
  }, [graph]);

  /**
   * Scales the camera about a screen point, keeping that point fixed.
   *
   * Zoom and offset are derived together inside a single pure updater. Deriving
   * the offset inside the zoom updater instead would apply the offset transform
   * twice per step under StrictMode's double-invoked updaters, which slides the
   * graph out from under the pointer.
   */
  const zoomAt = useCallback(
    (factor: number, screenX?: number, screenY?: number) => {
      cameraTouchedRef.current = true;
      setCamera((current) => {
        const nextZoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        if (nextZoom === current.zoom) return current;

        const actualFactor = nextZoom / current.zoom;
        const focusX = screenX !== undefined ? screenX : width / 2;
        const focusY = screenY !== undefined ? screenY : height / 2;

        return {
          zoom: nextZoom,
          offset: {
            x: current.offset.x * actualFactor + (focusX - width / 2) * (1 - actualFactor),
            y: current.offset.y * actualFactor + (focusY - height / 2) * (1 - actualFactor),
          },
        };
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

  const pan = useCallback((deltaX: number, deltaY: number) => {
    cameraTouchedRef.current = true;
    setCamera((current) => ({
      zoom: current.zoom,
      offset: { x: current.offset.x + deltaX, y: current.offset.y + deltaY },
    }));
  }, []);

  /**
   * Frames every laid-out node inside the canvas viewport.
   *
   * Without this the camera stays at its default offset while physics runs, so
   * a graph that settles away from the world origin (the usual case once node
   * count grows) ends up stacked in a corner or off-screen.
   *
   * @param paddingRatio empty space kept around the cluster, per axis.
   */
  const fitToView = useCallback(
    (paddingRatio = 0.18) => {
      const positioned = (simulationRef.current?.getNodes() ?? nodesRef.current).filter(
        (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
      );

      if (positioned.length === 0 || width <= 0 || height <= 0) {
        setCamera({ zoom: 1, offset: { x: 0, y: 0 } });
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const node of positioned) {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const usable = Math.max(0.1, 1 - paddingRatio * 2);

      const scale = Math.min(
        (width * usable) / Math.max(boxWidth, 80),
        (height * usable) / Math.max(boxHeight, 80),
      );
      const targetZoom = clamp(scale, 0.5, 1.8);

      setCamera({
        zoom: targetZoom,
        offset: { x: -centerX * targetZoom, y: -centerY * targetZoom },
      });
    },
    [width, height],
  );

  const resetView = useCallback(() => {
    cameraTouchedRef.current = false;
    fitToView();
    simulationRef.current?.unpinAll();
    simulationRef.current?.reheat(0.8);
  }, [fitToView]);

  const centerOn = useCallback(
    (nodeId: string) => {
      const node = simulationRef.current?.findNode(nodeId);
      if (!node || node.x == null || node.y == null) return;
      const worldX = node.x;
      const worldY = node.y;

      setCamera((current) => {
        const targetZoom = clamp(current.zoom, 0.8, 2.2);
        return {
          zoom: targetZoom,
          offset: { x: -worldX * targetZoom, y: -worldY * targetZoom },
        };
      });
    },
    [],
  );

  /**
   * Frames the graph once the container has real dimensions.
   *
   * The engine is constructed before `ResizeObserver` reports the canvas size,
   * so without this the first frames are computed against a zero-sized viewport
   * and the cluster is left wherever the initial spawn placed it.
   */
  useEffect(() => {
    if (width <= 0 || height <= 0 || nodes.length === 0 || hasAutoCenteredRef.current) return;

    hasAutoCenteredRef.current = true;
    if (activeNoteId) centerOn(activeNoteId);
    else fitToView();
  }, [width, height, nodes.length, activeNoteId, centerOn, fitToView]);

  /**
   * Keeps the camera framed while physics is still hot, then hands it back.
   *
   * The layout does not exist at mount: nodes start near their seed positions
   * and the force engine needs several hundred ticks to settle. A single fit
   * therefore frames an arbitrary initial bounding box and the real cluster
   * immediately drifts out of it. Tracking the settled extent each tick keeps
   * the graph centred for the whole settle, and stopping at the cooling floor
   * leaves a stable final framing.
   *
   * The user takes precedence: any pan or zoom ends auto-framing so the camera
   * never yanks away from an intentional gesture.
   */
  useEffect(() => {
    if (width <= 0 || height <= 0 || nodes.length === 0) return;
    if (cameraTouchedRef.current || alpha <= SETTLED_ALPHA) return;

    if (activeNoteId) centerOn(activeNoteId);
    else fitToView();
  }, [alpha, nodes.length, width, height, activeNoteId, centerOn, fitToView]);

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
    fitToView,
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