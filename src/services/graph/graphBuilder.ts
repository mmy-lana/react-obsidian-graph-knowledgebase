import type {
  GraphData,
  GraphFilterSettings,
  GraphNode,
  Note,
  RawGraphEdge,
} from '../../types/models';
import { extractTags, extractWikilinks } from '../markdown/parser';

const MIN_VAL = 4;
const MAX_VAL = 18;
const VAL_STEP = 1.5;

export interface BuildGraphOptions {
  /** Keeps only the active note plus its neighbourhood. */
  activeNoteId?: string | null;
  /** Include note ids from frontmatter tags in the resulting tag nodes. */
  includeFrontmatterTags?: boolean;
}

/**
 * Converts the vault into a node/edge graph.
 *
 * - `[[wikilinks]]` become edges between notes, or edges to a ghost node when
 *   the target does not exist and ghosts are enabled.
 * - `#tags` become tag nodes when enabled.
 * - Node size grows with connection count, clamped to a legible range.
 */
export function buildKnowledgeGraph(
  notes: Note[],
  filters: GraphFilterSettings,
  activeNoteId?: string | null,
  options: BuildGraphOptions = {},
): GraphData {
  const visibleNotes = notes.filter((note) => !note.isArchived);
  const includeFrontmatterTags = options.includeFrontmatterTags ?? false;

  const noteSlugMap = new Map<string, Note>();
  visibleNotes.forEach((note) => noteSlugMap.set(note.slug, note));

  const nodesMap = new Map<string, GraphNode>();
  const edgesMap = new Map<string, RawGraphEdge>();
  const linkCountMap = new Map<string, number>();

  visibleNotes.forEach((note) => {
    nodesMap.set(note.id, {
      id: note.id,
      slug: note.slug,
      title: note.title,
      group: 'note',
      val: MIN_VAL,
    });
    linkCountMap.set(note.id, 0);
  });

  const registerTagNode = (tag: string, ownerId: string): void => {
    const tagNodeId = `tag:${tag}`;
    if (!nodesMap.has(tagNodeId)) {
      nodesMap.set(tagNodeId, {
        id: tagNodeId,
        slug: `tag-${tag}`,
        title: `#${tag}`,
        group: 'tag',
        val: MIN_VAL,
      });
      linkCountMap.set(tagNodeId, 0);
    }

    const edgeId = `${ownerId}->${tagNodeId}`;
    if (!edgesMap.has(edgeId)) {
      edgesMap.set(edgeId, { id: edgeId, source: ownerId, target: tagNodeId, weight: 1 });
    }

    linkCountMap.set(ownerId, (linkCountMap.get(ownerId) ?? 0) + 1);
    linkCountMap.set(tagNodeId, (linkCountMap.get(tagNodeId) ?? 0) + 1);
  };

  visibleNotes.forEach((note) => {
    for (const wikilink of extractWikilinks(note.content)) {
      const targetNote = noteSlugMap.get(wikilink.targetSlug);

      if (targetNote) {
        const edgeId = `${note.id}->${targetNote.id}`;
        edgesMap.set(edgeId, { id: edgeId, source: note.id, target: targetNote.id, weight: 1 });
        linkCountMap.set(note.id, (linkCountMap.get(note.id) ?? 0) + 1);
        linkCountMap.set(targetNote.id, (linkCountMap.get(targetNote.id) ?? 0) + 1);
        continue;
      }

      if (!filters.showUnresolved) continue;

      const ghostId = `unresolved:${wikilink.targetSlug}`;
      if (!nodesMap.has(ghostId)) {
        nodesMap.set(ghostId, {
          id: ghostId,
          slug: wikilink.targetSlug,
          title: wikilink.targetTitle,
          group: 'unresolved',
          val: MIN_VAL,
        });
        linkCountMap.set(ghostId, 0);
      }

      const edgeId = `${note.id}->${ghostId}`;
      edgesMap.set(edgeId, { id: edgeId, source: note.id, target: ghostId, weight: 1 });
      linkCountMap.set(note.id, (linkCountMap.get(note.id) ?? 0) + 1);
      linkCountMap.set(ghostId, (linkCountMap.get(ghostId) ?? 0) + 1);
    }

    if (filters.showTags) {
      const tags = new Set<string>([
        ...extractTags(note.content),
        ...(includeFrontmatterTags ? note.frontmatter.tags ?? [] : []),
      ]);
      tags.forEach((tag) => {
        const clean = tag.replace(/^#/, '').trim();
        if (clean.length > 0) registerTagNode(clean, note.id);
      });
    }
  });

  nodesMap.forEach((node) => {
    const connections = linkCountMap.get(node.id) ?? 0;
    node.val = Math.max(MIN_VAL, Math.min(MAX_VAL, MIN_VAL + connections * VAL_STEP));
  });

  let finalNodes = Array.from(nodesMap.values());
  let finalEdges = Array.from(edgesMap.values());

  if (!filters.showOrphans) {
    finalNodes = finalNodes.filter((node) => (linkCountMap.get(node.id) ?? 0) > 0);
    const validNodeIds = new Set(finalNodes.map((node) => node.id));
    finalEdges = finalEdges.filter(
      (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target),
    );
  }

  const query = filters.searchQuery.trim().toLowerCase();
  if (query.length > 0) {
    const matchedNodeIds = new Set(
      finalNodes.filter((node) => node.title.toLowerCase().includes(query)).map((node) => node.id),
    );
    finalNodes = finalNodes.filter((node) => matchedNodeIds.has(node.id));
    finalEdges = finalEdges.filter(
      (edge) => matchedNodeIds.has(edge.source) && matchedNodeIds.has(edge.target),
    );
  }

  if (activeNoteId && filters.maxDepth > 0) {
    ({ nodes: finalNodes, edges: finalEdges } = limitToDepth(
      finalNodes,
      finalEdges,
      activeNoteId,
      filters.maxDepth,
    ));
  }

  return { nodes: finalNodes, edges: finalEdges };
}

/**
 * Breadth-first truncation: keeps the active note plus everything reachable
 * within `maxDepth` hops. The active note is always retained even when the
 * current filters would otherwise hide it.
 */
export function limitToDepth(
  nodes: GraphNode[],
  edges: RawGraphEdge[],
  rootId: string,
  maxDepth: number,
): { nodes: GraphNode[]; edges: RawGraphEdge[] } {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }

  const distances = new Map<string, number>([[rootId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    for (const neighbour of adjacency.get(id) ?? []) {
      if (distances.has(neighbour)) continue;
      distances.set(neighbour, depth + 1);
      queue.push({ id: neighbour, depth: depth + 1 });
    }
  }

  const keptIds = new Set(distances.keys());
  return {
    nodes: nodes.filter((node) => keptIds.has(node.id)),
    edges: edges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target)),
  };
}

/** Adjacency map of note id → set of neighbour ids (undirected). */
export function buildAdjacency(edges: RawGraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  return adjacency;
}