/**
 * Canonical data model for the Personal Knowledge Base Network.
 *
 * Every entity persisted in IndexedDB, derived in the graph pipeline, or held
 * in reactive state is described here so that storage, services, hooks and
 * components share a single source of truth.
 */

export type ID = string;

export interface Frontmatter {
  title?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
}

/**
 * Raw YAML payload straight out of `js-yaml`. Unknown keys are preserved so
 * users may round-trip custom frontmatter without the app discarding data.
 */
export type FrontmatterRaw = Frontmatter & Record<string, unknown>;

export interface Note {
  id: ID;
  slug: string;
  title: string;
  content: string;
  folderId: ID | null;
  frontmatter: Frontmatter;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  isArchived: boolean;
}

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  createdAt: number;
}

/** A single `[[wikilink]]` occurrence found inside note content. */
export interface WikiLink {
  /** Full source text of the match, e.g. `[[Graph Theory|Graphs]]`. */
  raw: string;
  /** Link target before slugification, exactly as authored. */
  targetTitle: string;
  /** Slugified target used for graph/lookup resolution. */
  targetSlug: string;
  /** Optional pipe alias, undefined when absent. */
  alias?: string;
  /** Inclusive character offset of the match start. */
  startIndex: number;
  /** Exclusive character offset of the match end. */
  endIndex: number;
}

/** Indexed, persisted link row linking a source note to a (possibly missing) target. */
export interface NoteLink {
  id: ID;
  sourceNoteId: ID;
  targetSlug: string;
  targetNoteId: ID | null;
  alias: string | null;
  createdAt: number;
}

/** A resolved inbound link enriched with contextual content for display. */
export interface BacklinkItem {
  sourceNoteId: ID;
  sourceTitle: string;
  sourceSlug: string;
  excerpt: string;
}

export type GraphNodeGroup = 'note' | 'unresolved' | 'tag';

export interface GraphNode {
  id: ID;
  slug: string;
  title: string;
  group: GraphNodeGroup;
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

/** Edge expressed with node id strings, safe to store and serialize. */
export interface RawGraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

/** Edge bound to live node object references by the physics engine. */
export interface ResolvedGraphEdge {
  id: string;
  source: GraphNode;
  target: GraphNode;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: RawGraphEdge[];
}

export interface GraphPhysicsSettings {
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  collisionRadius: number;
  centerStrength: number;
  damping: number;
  alphaDecay: number;
}

export interface GraphFilterSettings {
  showOrphans: boolean;
  showTags: boolean;
  showUnresolved: boolean;
  searchQuery: string;
  maxDepth: number;
}

export interface GraphVisualSettings {
  nodeColor: string;
  unresolvedColor: string;
  tagColor: string;
  edgeColor: string;
  highlightColor: string;
  showLabels: boolean;
  minNodeRadius: number;
  maxNodeRadius: number;
}

export type ViewMode = 'editor' | 'graph' | 'split';
export type EditorMode = 'source' | 'preview' | 'live';

export interface UserPreferences {
  activeNoteId: ID | null;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  activeView: ViewMode;
  editorMode: EditorMode;
  graphPhysics: GraphPhysicsSettings;
  graphFilters: GraphFilterSettings;
  graphVisuals: GraphVisualSettings;
}

export type SearchMatchField = 'title' | 'content' | 'tags';

export interface SearchMatch {
  field: SearchMatchField;
  snippet: string;
}

export interface SearchResult {
  note: Note;
  matchScore: number;
  matches: SearchMatch[];
}

/** Default physics tuning used by the canvas renderer and the controls panel. */
export const DEFAULT_GRAPH_PHYSICS: GraphPhysicsSettings = {
  chargeStrength: 4200,
  linkDistance: 110,
  linkStrength: 0.06,
  collisionRadius: 12,
  centerStrength: 0.012,
  damping: 0.82,
  alphaDecay: 0.0215,
};

export const DEFAULT_GRAPH_FILTERS: GraphFilterSettings = {
  showOrphans: true,
  showTags: false,
  showUnresolved: true,
  searchQuery: '',
  maxDepth: 2,
};

export const DEFAULT_GRAPH_VISUALS: GraphVisualSettings = {
  nodeColor: '#38bdf8',
  unresolvedColor: '#fb7185',
  tagColor: '#a855f7',
  edgeColor: '#334155',
  highlightColor: '#fbbf24',
  showLabels: true,
  minNodeRadius: 4,
  maxNodeRadius: 18,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  activeNoteId: null,
  sidebarOpen: true,
  rightPanelOpen: true,
  activeView: 'split',
  editorMode: 'live',
  graphPhysics: DEFAULT_GRAPH_PHYSICS,
  graphFilters: DEFAULT_GRAPH_FILTERS,
  graphVisuals: DEFAULT_GRAPH_VISUALS,
};