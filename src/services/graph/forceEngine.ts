import type {
  GraphNode,
  GraphPhysicsSettings,
  RawGraphEdge,
  ResolvedGraphEdge,
} from '../../types/models';

/** Barnes-Hut quadtree cell approximating the mass of everything inside it. */
interface QuadNode {
  x: number;
  y: number;
  size: number;
  /** Sum of `val` inside this cell. */
  mass: number;
  /** Centre of mass inside this cell. */
  centerX: number;
  centerY: number;
  /** Single body stored while the cell is a leaf. */
  body: GraphNode | null;
  children: QuadNode[] | null;
}

const THETA_SQUARED = 0.81; // theta = 0.9
const MAX_DEPTH = 22;
const BARNES_HUT_THRESHOLD = 60;
const SAFE_DISTANCE = 1;

/**
 * 2D force-directed layout engine.
 *
 * Per tick:
 *   1. gravity toward the canvas centre (skipped for pinned nodes)
 *   2. many-body repulsion — exact O(n²) for small graphs, Barnes-Hut above 60 nodes
 *   3. collision relaxation so nodes never fully overlap
 *   4. spring forces along links
 *   5. velocity damping and integration
 *
 * The simulation cools through `alphaDecay`; `reheat()` re-energises it after
 * data, settings or interaction changes.
 */
export class ForceDirectedSimulation {
  private nodes: GraphNode[] = [];
  private edges: ResolvedGraphEdge[] = [];
  private settings: GraphPhysicsSettings;
  private width: number;
  private height: number;
  private alpha = 1;
  private alphaMin = 0.001;
  private isRunning = false;
  private animFrameId: number | null = null;
  private onTickCallback: ((nodes: GraphNode[]) => void) | null = null;
  private destroyed = false;

  constructor(width: number, height: number, settings: GraphPhysicsSettings) {
    this.width = width;
    this.height = height;
    this.settings = settings;
  }

  public setData(rawNodes: GraphNode[], rawEdges: RawGraphEdge[]): void {
    const previous = new Map(this.nodes.map((node) => [node.id, node]));
    const nodeMap = new Map<string, GraphNode>();
    const width = this.width || 1;
    const height = this.height || 1;

    this.nodes = rawNodes.map((original) => {
      const cached = previous.get(original.id);
      const cloned: GraphNode = {
        ...original,
        x: original.x ?? cached?.x ?? width / 2 + (Math.random() - 0.5) * (width * 0.4),
        y: original.y ?? cached?.y ?? height / 2 + (Math.random() - 0.5) * (height * 0.4),
        vx: original.vx ?? cached?.vx ?? 0,
        vy: original.vy ?? cached?.vy ?? 0,
        fx: original.fx ?? null,
        fy: original.fy ?? null,
      };
      nodeMap.set(cloned.id, cloned);
      return cloned;
    });

    this.edges = rawEdges
      .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: nodeMap.get(edge.source)!,
        target: nodeMap.get(edge.target)!,
        weight: edge.weight,
      }));

    this.alpha = 1;
  }

  public setDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  public setSettings(settings: GraphPhysicsSettings): void {
    this.settings = settings;
    this.reheat();
  }

  public getSettings(): GraphPhysicsSettings {
    return this.settings;
  }

  public getNodes(): GraphNode[] {
    return this.nodes;
  }

  public getEdges(): ResolvedGraphEdge[] {
    return this.edges;
  }

  public getAlpha(): number {
    return this.alpha;
  }

  public isSimulating(): boolean {
    return this.isRunning;
  }

  public reheat(target = 0.4): void {
    this.alpha = Math.max(this.alpha, target);
    if (!this.isRunning && !this.destroyed) this.start();
  }

  public onTick(callback: (nodes: GraphNode[]) => void): void {
    this.onTickCallback = callback;
  }

  public start(): void {
    if (this.isRunning || this.destroyed) return;
    // Headless/SSR environments have no frame loop; callers tick manually.
    if (typeof requestAnimationFrame !== 'function') return;

    this.isRunning = true;

    const step = () => {
      if (!this.isRunning) return;

      this.tick();
      this.onTickCallback?.(this.nodes);

      if (this.alpha > this.alphaMin) {
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.isRunning = false;
        this.animFrameId = null;
      }
    };

    this.animFrameId = requestAnimationFrame(step);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public destroy(): void {
    this.stop();
    this.onTickCallback = null;
    this.nodes = [];
    this.edges = [];
    this.destroyed = true;
  }

  public findNode(id: string): GraphNode | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  /**
   * Moves a node and (optionally) pins it in place.
   * Passing `pinned: false` releases the node back into the simulation.
   */
  public setNodePosition(
    id: string,
    x: number | null,
    y: number | null,
    pinned = true,
  ): void {
    const node = this.findNode(id);
    if (!node) return;

    if (x !== null && y !== null) {
      node.x = x;
      node.y = y;
      node.vx = 0;
      node.vy = 0;
      node.fx = pinned ? x : null;
      node.fy = pinned ? y : null;
    } else {
      node.fx = null;
      node.fy = null;
    }

    this.reheat(0.25);
  }

  public unpinAll(): void {
    for (const node of this.nodes) {
      node.fx = null;
      node.fy = null;
    }
    this.reheat(0.6);
  }

  /** Advances the simulation by exactly one step. */
  public tick(): void {
    if (this.alpha <= this.alphaMin || this.nodes.length === 0) return;

    const nodes = this.nodes;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const { chargeStrength, linkDistance, linkStrength, collisionRadius, centerStrength, damping } =
      this.settings;

    // 1. Gravity toward the centre.
    for (const node of nodes) {
      if (node.fx != null || node.fy != null) continue;
      node.vx = (node.vx ?? 0) + (centerX - (node.x ?? 0)) * centerStrength * this.alpha;
      node.vy = (node.vy ?? 0) + (centerY - (node.y ?? 0)) * centerStrength * this.alpha;
    }

    // 2. Repulsion.
    if (nodes.length <= BARNES_HUT_THRESHOLD) {
      this.#applyPairwiseRepulsion(nodes, chargeStrength);
    } else {
      const tree = this.#buildQuadtree(nodes);
      for (const node of nodes) {
        this.#applyRepulsion(node, tree, node);
      }
    }

    this.#applyCollision(nodes, collisionRadius);

    // 3. Springs.
    for (const edge of this.edges) {
      const { source, target } = edge;
      if (source.x == null || source.y == null || target.x == null || target.y == null) continue;

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) dist = 1e-3;

      const delta = (dist - linkDistance) * linkStrength * this.alpha;
      const fx = (dx / dist) * delta;
      const fy = (dy / dist) * delta;

      if (source.fx == null) {
        source.vx = (source.vx ?? 0) + fx;
        source.vy = (source.vy ?? 0) + fy;
      }
      if (target.fx == null) {
        target.vx = (target.vx ?? 0) - fx;
        target.vy = (target.vy ?? 0) - fy;
      }
    }

    // 4. Integration with damping.
    for (const node of nodes) {
      if (node.fx != null && node.fy != null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
      } else {
        node.vx = (node.vx ?? 0) * damping;
        node.vy = (node.vy ?? 0) * damping;
        node.x = (node.x ?? 0) + (node.vx ?? 0);
        node.y = (node.y ?? 0) + (node.vy ?? 0);
      }
    }

    this.alpha *= 1 - this.settings.alphaDecay;
  }

  #applyPairwiseRepulsion(nodes: GraphNode[], chargeStrength: number): void {
    for (let i = 0; i < nodes.length; i += 1) {
      const u = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const v = nodes[j];

        let dx = (v.x ?? 0) - (u.x ?? 0);
        let dy = (v.y ?? 0) - (u.y ?? 0);
        let distSq = dx * dx + dy * dy;

        if (distSq === 0) {
          dx = (Math.random() - 0.5) * 1e-3;
          dy = (Math.random() - 0.5) * 1e-3;
          distSq = dx * dx + dy * dy;
        }

        const dist = Math.sqrt(distSq);
        const force = (chargeStrength * this.alpha) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (u.fx == null) {
          u.vx = (u.vx ?? 0) - fx;
          u.vy = (u.vy ?? 0) - fy;
        }
        if (v.fx == null) {
          v.vx = (v.vx ?? 0) + fx;
          v.vy = (v.vy ?? 0) + fy;
        }
      }
    }
  }

  #applyCollision(nodes: GraphNode[], collisionRadius: number): void {
    for (let i = 0; i < nodes.length; i += 1) {
      const u = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const v = nodes[j];

        let dx = (v.x ?? 0) - (u.x ?? 0);
        let dy = (v.y ?? 0) - (u.y ?? 0);
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) dist = 1e-3;

        const minDist = (u.val + v.val) * 1.8 + collisionRadius;
        if (dist >= minDist) continue;

        const overlap = minDist - dist;
        const cx = (dx / dist) * overlap * 0.5;
        const cy = (dy / dist) * overlap * 0.5;

        if (u.fx == null) {
          u.x = (u.x ?? 0) - cx;
          u.y = (u.y ?? 0) - cy;
        }
        if (v.fx == null) {
          v.x = (v.x ?? 0) + cx;
          v.y = (v.y ?? 0) + cy;
        }
      }
    }
  }

  #makeQuad(x: number, y: number, size: number): QuadNode {
    return { x, y, size, mass: 0, centerX: 0, centerY: 0, body: null, children: null };
  }

  #accumulate(quad: QuadNode, node: GraphNode): void {
    const weight = node.val;
    quad.mass += weight;
    quad.centerX += (node.x ?? 0) * weight;
    quad.centerY += (node.y ?? 0) * weight;
  }

  #childIndex(quad: QuadNode, node: GraphNode): number {
    const half = quad.size / 2;
    const right = (node.x ?? 0) >= quad.x + half ? 1 : 0;
    const bottom = (node.y ?? 0) >= quad.y + half ? 1 : 0;
    return right * 2 + bottom;
  }

  #insert(quad: QuadNode, node: GraphNode, depth: number): void {
    if (depth >= MAX_DEPTH || (quad.body === null && quad.children === null)) {
      quad.body = node;
      this.#accumulate(quad, node);
      return;
    }

    if (quad.body !== null) {
      const displaced = quad.body;
      quad.body = null;

      if (quad.children === null) {
        const half = quad.size / 2;
        quad.children = [
          this.#makeQuad(quad.x, quad.y, half),
          this.#makeQuad(quad.x + half, quad.y, half),
          this.#makeQuad(quad.x, quad.y + half, half),
          this.#makeQuad(quad.x + half, quad.y + half, half),
        ];
      }

      const displacedChild = quad.children[this.#childIndex(quad, displaced)];
      this.#insert(displacedChild, displaced, depth + 1);
    }

    const child = quad.children![this.#childIndex(quad, node)];
    this.#insert(child, node, depth + 1);
    this.#accumulate(quad, node);
  }

  #buildQuadtree(nodes: GraphNode[]): QuadNode {
    const minX = Math.min(...nodes.map((node) => node.x ?? 0));
    const minY = Math.min(...nodes.map((node) => node.y ?? 0));
    const maxX = Math.max(...nodes.map((node) => node.x ?? 0));
    const maxY = Math.max(...nodes.map((node) => node.y ?? 0));
    const size = Math.max(maxX - minX, maxY - minY, 1);

    const root = this.#makeQuad(minX - size * 0.1, minY - size * 0.1, size * 1.2);
    for (const node of nodes) {
      this.#insert(root, node, 0);
    }
    return root;
  }

  #applyRepulsion(node: GraphNode, quad: QuadNode, skip: GraphNode): void {
    if (quad.mass === 0) return;

    if (quad.body !== null) {
      if (quad.body === skip) return;
      const other = quad.body;
      let dx = (node.x ?? 0) - (other.x ?? 0);
      let dy = (node.y ?? 0) - (other.y ?? 0);
      let distSq = dx * dx + dy * dy;
      if (distSq < 1e-6) {
        dx = (Math.random() - 0.5) * 1e-3;
        dy = (Math.random() - 0.5) * 1e-3;
        distSq = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(distSq);
      const force = (this.settings.chargeStrength * this.alpha * other.val) / distSq;
      if (node.fx == null) {
        node.vx = (node.vx ?? 0) + (dx / dist) * force;
        node.vy = (node.vy ?? 0) + (dy / dist) * force;
      }
      return;
    }

    if (quad.children === null) return;

    const centerX = quad.centerX / quad.mass;
    const centerY = quad.centerY / quad.mass;
    const dx = (node.x ?? 0) - centerX;
    const dy = (node.y ?? 0) - centerY;
    const distSq = dx * dx + dy * dy;

    if (quad.size * quad.size < THETA_SQUARED * distSq) {
      const dist = Math.max(Math.sqrt(distSq), SAFE_DISTANCE);
      const force = (this.settings.chargeStrength * this.alpha * quad.mass) / distSq;
      if (node.fx == null) {
        node.vx = (node.vx ?? 0) + (dx / dist) * force;
        node.vy = (node.vy ?? 0) + (dy / dist) * force;
      }
      return;
    }

    for (const child of quad.children) {
      this.#applyRepulsion(node, child, skip);
    }
  }
}

export default ForceDirectedSimulation;