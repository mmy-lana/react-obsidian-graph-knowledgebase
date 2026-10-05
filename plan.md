# Architecture & Implementation Plan: Personal Knowledge Base Network (Obsidian Clone)

## Overview
- Project Title: Personal Knowledge Base Network (Obsidian Clone)
- Repository / Slug: `react-obsidian-graph-knowledgebase`
- Framework & Tech Stack: React (latest), TypeScript (strict), Tailwind CSS (latest / v4 CSS-first), Dexie.js (latest) + `dexie-react-hooks` (latest), HTML5 Canvas 2D Force-Directed Simulation Engine, `js-yaml` (latest) + `@types/js-yaml` (latest), Lucide React (latest).
- Theme & Aesthetic: Minimal Dark Slate (`--color-canvas: #090d16`, `--color-surface: #0f172a`, `--color-elevated: #1e293b`, `--color-border: #334155`, `--color-node-cyan: #38bdf8`, `--color-node-purple: #a855f7`).
- Architecture Pattern: Offline-First Client Architecture with reactive IndexedDB storage, atomic transactional renaming cascades, typed graph edge resolution, and high-DPI 60 FPS HTML5 Canvas physics simulation.

---

## 1. Data Schema & Pure TypeScript Interfaces

```typescript
// src/types/models.ts

export type ID = string;

export interface Frontmatter {
  title?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
}

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

export interface WikiLink {
  raw: string;
  targetTitle: string;
  targetSlug: string;
  alias?: string;
  startIndex: number;
  endIndex: number;
}

export interface NoteLink {
  id: ID;
  sourceNoteId: ID;
  targetSlug: string;
  targetNoteId: ID | null;
  alias: string | null;
  createdAt: number;
}

export interface BacklinkItem {
  sourceNoteId: ID;
  sourceTitle: string;
  sourceSlug: string;
  excerpt: string;
}

export interface GraphNode {
  id: ID;
  slug: string;
  title: string;
  group: 'note' | 'unresolved' | 'tag';
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface RawGraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

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

export interface UserPreferences {
  activeNoteId: ID | null;
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  activeView: 'editor' | 'graph' | 'split';
  editorMode: 'source' | 'preview' | 'live';
  graphPhysics: GraphPhysicsSettings;
  graphFilters: GraphFilterSettings;
  graphVisuals: GraphVisualSettings;
}

export interface SearchResult {
  note: Note;
  matchScore: number;
  matches: {
    field: 'title' | 'content' | 'tags';
    snippet: string;
  }[];
}
```

```typescript
// src/services/db/schema.ts
import Dexie, { type Table } from 'dexie';
import type { Note, Folder, NoteLink } from '../../types/models';

export class KnowledgeBaseDatabase extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  links!: Table<NoteLink, string>;

  constructor() {
    super('ObsidianKnowledgeBaseDB');
    this.version(1).stores({
      notes: 'id, slug, title, folderId, createdAt, updatedAt, isPinned, isArchived',
      folders: 'id, parentId, name, createdAt',
      links: 'id, sourceNoteId, targetSlug, targetNoteId',
    });
  }
}

let dbInstance: KnowledgeBaseDatabase | null = null;

/**
 * Lazy factory providing a single DB instance across SSR, test, and browser environments.
 * Dexie handles pre-open request queuing internally; manual open() calls and ready-state guards must not be added.
 */
export const getDb = (): KnowledgeBaseDatabase => {
  if (!dbInstance) {
    dbInstance = new KnowledgeBaseDatabase();
  }
  return dbInstance;
};
```

---

## 2. Component Architecture

```
src/
├── globals.css                       # Tailwind v4 @theme variables & base styling
├── components/
│   ├── ui/                           # Atomic primitives
│   │   ├── Button.tsx
│   │   ├── IconButton.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── Modal.tsx
│   │   ├── DropdownMenu.tsx
│   │   ├── Slider.tsx
│   │   ├── Switch.tsx
│   │   ├── Badge.tsx
│   │   └── Tooltip.tsx
│   ├── molecules/                    # Compound components
│   │   ├── SearchBar.tsx
│   │   ├── TreeItem.tsx
│   │   ├── TagBadge.tsx
│   │   ├── WikilinkSuggestPopover.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── TabNavigation.tsx
│   ├── domain/                       # Knowledge base domain widgets
│   │   ├── editor/
│   │   │   ├── MarkdownEditor.tsx
│   │   │   ├── MarkdownPreview.tsx
│   │   │   ├── FrontmatterPanel.tsx
│   │   │   └── EditorToolbar.tsx
│   │   ├── graph/
│   │   │   ├── ForceGraphCanvas.tsx
│   │   │   ├── GraphControls.tsx
│   │   │   ├── GraphLegend.tsx
│   │   │   └── LocalGraphView.tsx
│   │   ├── sidebar/
│   │   │   ├── FileExplorer.tsx
│   │   │   ├── FolderTree.tsx
│   │   │   ├── TagExplorer.tsx
│   │   │   └── NewNoteButton.tsx
│   │   ├── inspector/
│   │   │   ├── BacklinksList.tsx
│   │   │   ├── OutgoingLinksList.tsx
│   │   │   └── NoteMetadata.tsx
│   │   └── palette/
│   │       ├── CommandPalette.tsx
│   │       └── QuickSwitcherModal.tsx
│   └── shell/                        # Responsive structural shell
│       ├── AppHeader.tsx
│       ├── AppLayout.tsx
│       ├── MobileNavBar.tsx
│       ├── MobileDrawer.tsx
│       └── SplitPaneContainer.tsx
├── hooks/
│   ├── useNotes.ts
│   ├── useNoteLinks.ts
│   ├── useGraphSimulation.ts
│   ├── useCommandPalette.ts
│   ├── useWikilinkAutoComplete.ts
│   ├── useResponsiveLayout.ts
│   └── useDebounce.ts
├── services/
│   ├── db/
│   │   ├── schema.ts
│   │   └── seed.ts
│   ├── markdown/
│   │   ├── parser.ts
│   │   └── renderer.ts
│   └── graph/
│       ├── forceEngine.ts
│       └── graphBuilder.ts
└── utils/
    ├── slug.ts
    ├── id.ts
    └── format.ts
```

### Mobile-First Layout Rules
- **360px - 389px (Compact Mobile)**:
  - Single active pane layout.
  - `MobileNavBar` displays icon-only navigation with `sr-only` text labels to avoid text-wrapping.
  - `EditorToolbar` uses `overflow-x-auto scrollbar-none flex-nowrap shrink-0` to maintain horizontal scrolling without layout shifts.
  - `WikilinkSuggestPopover` renders as an anchored bottom action drawer on `pointer: coarse` screens instead of calculating cursor coordinates.
  - `Modal` uses `bg-black/70 backdrop-blur-sm` to maintain 60 FPS on lower-tier mobile GPUs.
- **390px - 430px (Standard / Pro Mobile)**:
  - Bottom navigation displays stacked icons with 10px subtitle labels.
  - Slide-in drawer interfaces for File Explorer and Backlinks inspector.
  - Draggable split-pane handles are strictly hidden on viewports `< 768px` (`hidden md:block`).
- **768px (Tablet)**:
  - Left sidebar (240px) collapsible into icon dock.
  - Split views permitted (Editor alongside Local Graph inspector).
  - Draggable divider enabled with `touch-action: none` and a 16px (`w-4`) invisible tap hit area with `w-[1px]` visual border.
- **1024px+ (Desktop)**:
  - 3-column layout: Left Explorer (260px) | Central Editor / Global Graph Canvas | Right Backlinks & Local Graph (280px).
  - Full keyboard command shortcut coverage (`Cmd+O`, `Cmd+P`, `Cmd+E`, `Cmd+G`).

---

## 3. Core Feature Logic & Pure Algorithms

### 3.1 Slugifier, Regex Escaping, and Node/Browser Fallbacks

```typescript
// src/utils/slug.ts

export const slugify = (text: string): string => {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  if (slug.length > 0) {
    return slug;
  }

  // Node.js test environment & non-Latin title fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
};

export const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

```typescript
// src/utils/id.ts

export const genId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};
```

### 3.2 Markdown, Frontmatter, and Link Extraction

```typescript
// src/services/markdown/parser.ts
import yaml from 'js-yaml';
import type { WikiLink, Frontmatter } from '../../types/models';
import { slugify } from '../../utils/slug';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function extractWikilinks(content: string): WikiLink[] {
  // Regex instantiated in function scope to prevent module-level lastIndex state bugs
  const wikilinkRegex = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = wikilinkRegex.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    const rawAlias = match[2]?.trim();
    links.push({
      raw: match[0],
      targetTitle: rawTarget,
      targetSlug: slugify(rawTarget),
      alias: rawAlias || undefined,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return links;
}

export function extractTags(content: string): string[] {
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-/]+)(?=\s|$|[.,;:!?])/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

export function parseFrontmatter(rawContent: string): { frontmatter: Frontmatter; body: string } {
  const match = FRONTMATTER_REGEX.exec(rawContent);
  if (!match) {
    return { frontmatter: {}, body: rawContent };
  }

  const rawYaml = match[1];
  const body = rawContent.slice(match[0].length);
  let parsed: unknown = {};

  try {
    parsed = yaml.load(rawYaml) || {};
  } catch {
    parsed = {};
  }

  const rawObj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const frontmatter: Frontmatter = {};

  if (typeof rawObj.title === 'string') frontmatter.title = rawObj.title;
  if (typeof rawObj.created === 'string') frontmatter.created = rawObj.created;
  if (typeof rawObj.updated === 'string') frontmatter.updated = rawObj.updated;

  if (Array.isArray(rawObj.tags)) {
    frontmatter.tags = rawObj.tags.map(String);
  } else if (typeof rawObj.tags === 'string') {
    frontmatter.tags = [rawObj.tags];
  }

  if (Array.isArray(rawObj.aliases)) {
    frontmatter.aliases = rawObj.aliases.map(String);
  } else if (typeof rawObj.aliases === 'string') {
    frontmatter.aliases = [rawObj.aliases];
  }

  return { frontmatter, body };
}
```

### 3.3 Graph Data Resolution & Edge Typing

```typescript
// src/services/graph/graphBuilder.ts
import type { Note, GraphData, GraphNode, RawGraphEdge, GraphFilterSettings } from '../../types/models';
import { extractWikilinks, extractTags } from '../markdown/parser';

export function buildKnowledgeGraph(
  notes: Note[],
  filters: GraphFilterSettings,
  activeNoteId?: string | null
): GraphData {
  const noteSlugMap = new Map<string, Note>();
  notes.forEach((note) => noteSlugMap.set(note.slug, note));

  const nodesMap = new Map<string, GraphNode>();
  const edgesMap = new Map<string, RawGraphEdge>();
  const linkCountMap = new Map<string, number>();

  notes.forEach((note) => {
    nodesMap.set(note.id, {
      id: note.id,
      slug: note.slug,
      title: note.title,
      group: 'note',
      val: 5,
    });
    linkCountMap.set(note.id, 0);
  });

  notes.forEach((note) => {
    const wikilinks = extractWikilinks(note.content);

    wikilinks.forEach((wl) => {
      const targetNote = noteSlugMap.get(wl.targetSlug);

      if (targetNote) {
        const edgeId = `${note.id}->${targetNote.id}`;
        edgesMap.set(edgeId, {
          id: edgeId,
          source: note.id,
          target: targetNote.id,
          weight: 1,
        });

        linkCountMap.set(note.id, (linkCountMap.get(note.id) || 0) + 1);
        linkCountMap.set(targetNote.id, (linkCountMap.get(targetNote.id) || 0) + 1);
      } else if (filters.showUnresolved) {
        const ghostId = `unresolved:${wl.targetSlug}`;
        if (!nodesMap.has(ghostId)) {
          nodesMap.set(ghostId, {
            id: ghostId,
            slug: wl.targetSlug,
            title: wl.targetTitle,
            group: 'unresolved',
            val: 3,
          });
          linkCountMap.set(ghostId, 0);
        }

        const edgeId = `${note.id}->${ghostId}`;
        edgesMap.set(edgeId, {
          id: edgeId,
          source: note.id,
          target: ghostId,
          weight: 1,
        });

        linkCountMap.set(note.id, (linkCountMap.get(note.id) || 0) + 1);
        linkCountMap.set(ghostId, (linkCountMap.get(ghostId) || 0) + 1);
      }
    });

    if (filters.showTags) {
      const tags = extractTags(note.content);
      tags.forEach((tag) => {
        const tagNodeId = `tag:${tag}`;
        if (!nodesMap.has(tagNodeId)) {
          nodesMap.set(tagNodeId, {
            id: tagNodeId,
            slug: `tag-${tag}`,
            title: `#${tag}`,
            group: 'tag',
            val: 4,
          });
          linkCountMap.set(tagNodeId, 0);
        }

        const edgeId = `${note.id}->${tagNodeId}`;
        edgesMap.set(edgeId, {
          id: edgeId,
          source: note.id,
          target: tagNodeId,
          weight: 1,
        });

        linkCountMap.set(note.id, (linkCountMap.get(note.id) || 0) + 1);
        linkCountMap.set(tagNodeId, (linkCountMap.get(tagNodeId) || 0) + 1);
      });
    }
  });

  nodesMap.forEach((node) => {
    const connections = linkCountMap.get(node.id) || 0;
    node.val = Math.max(4, Math.min(18, 4 + connections * 1.5));
  });

  let finalNodes = Array.from(nodesMap.values());
  let finalEdges = Array.from(edgesMap.values());

  if (!filters.showOrphans) {
    finalNodes = finalNodes.filter((node) => (linkCountMap.get(node.id) || 0) > 0);
    const validNodeIds = new Set(finalNodes.map((n) => n.id));
    finalEdges = finalEdges.filter(
      (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );
  }

  if (filters.searchQuery.trim().length > 0) {
    const query = filters.searchQuery.toLowerCase();
    const matchedNodeIds = new Set(
      finalNodes.filter((n) => n.title.toLowerCase().includes(query)).map((n) => n.id)
    );
    finalNodes = finalNodes.filter((n) => matchedNodeIds.has(n.id));
    finalEdges = finalEdges.filter(
      (e) => matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target)
    );
  }

  return { nodes: finalNodes, edges: finalEdges };
}
```

### 3.4 2D Force-Directed Simulation Engine

```typescript
// src/services/graph/forceEngine.ts
import type { GraphNode, RawGraphEdge, ResolvedGraphEdge, GraphPhysicsSettings } from '../../types/models';

export class ForceDirectedSimulation {
  private nodes: GraphNode[] = [];
  private edges: ResolvedGraphEdge[] = [];
  private settings: GraphPhysicsSettings;
  private width: number;
  private height: number;
  private alpha: number = 1.0;
  private alphaMin: number = 0.001;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private onTickCallback: ((nodes: GraphNode[]) => void) | null = null;

  constructor(width: number, height: number, settings: GraphPhysicsSettings) {
    this.width = width;
    this.height = height;
    this.settings = settings;
  }

  public setData(rawNodes: GraphNode[], rawEdges: RawGraphEdge[]) {
    const nodeMap = new Map<string, GraphNode>();
    this.nodes = rawNodes.map((original) => {
      const cloned: GraphNode = {
        ...original,
        x: original.x ?? this.width / 2 + (Math.random() - 0.5) * (this.width * 0.4),
        y: original.y ?? this.height / 2 + (Math.random() - 0.5) * (this.height * 0.4),
        vx: original.vx ?? 0,
        vy: original.vy ?? 0,
        fx: original.fx ?? null,
        fy: original.fy ?? null,
      };
      nodeMap.set(cloned.id, cloned);
      return cloned;
    });

    this.edges = rawEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        id: e.id,
        source: nodeMap.get(e.source)!,
        target: nodeMap.get(e.target)!,
        weight: e.weight,
      }));

    this.alpha = 1.0;
  }

  public setDimensions(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public setSettings(settings: GraphPhysicsSettings) {
    this.settings = settings;
    this.reheat();
  }

  public reheat() {
    this.alpha = Math.max(this.alpha, 0.4);
    if (!this.isRunning) {
      this.start();
    }
  }

  public onTick(cb: (nodes: GraphNode[]) => void) {
    this.onTickCallback = cb;
  }

  public start() {
    this.isRunning = true;
    const step = () => {
      if (!this.isRunning) return;
      this.tick();
      if (this.onTickCallback) {
        this.onTickCallback(this.nodes);
      }
      if (this.alpha > this.alphaMin) {
        this.animFrameId = requestAnimationFrame(step);
      } else {
        this.isRunning = false;
      }
    };
    this.animFrameId = requestAnimationFrame(step);
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public tick() {
    if (this.alpha <= this.alphaMin) return;

    const n = this.nodes.length;
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // 1. Center Pull Force
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i];
      if (node.fx != null && node.fy != null) continue;
      node.vx! += (centerX - node.x!) * this.settings.centerStrength * this.alpha;
      node.vy! += (centerY - node.y!) * this.settings.centerStrength * this.alpha;
    }

    // 2. Many-Body Repulsion & Collision Hard Boundary
    for (let i = 0; i < n; i++) {
      const u = this.nodes[i];
      for (let j = i + 1; j < n; j++) {
        const v = this.nodes[j];
        let dx = v.x! - u.x!;
        let dy = v.y! - u.y!;
        let distSq = dx * dx + dy * dy;
        if (distSq === 0) {
          dx = (Math.random() - 0.5) * 1e-3;
          dy = (Math.random() - 0.5) * 1e-3;
          distSq = dx * dx + dy * dy;
        }

        const dist = Math.sqrt(distSq);
        const force = (this.settings.chargeStrength * this.alpha) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (u.fx == null) {
          u.vx! -= fx;
          u.vy! -= fy;
        }
        if (v.fx == null) {
          v.vx! += fx;
          v.vy! += fy;
        }

        const minDist = (u.val + v.val) * 1.8 + this.settings.collisionRadius;
        if (dist < minDist) {
          const overlap = minDist - dist;
          const cx = (dx / dist) * overlap * 0.5;
          const cy = (dy / dist) * overlap * 0.5;
          if (u.fx == null) {
            u.x! -= cx;
            u.y! -= cy;
          }
          if (v.fx == null) {
            v.x! += cx;
            v.y! += cy;
          }
        }
      }
    }

    // 3. Link Spring Force
    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      const source = edge.source;
      const target = edge.target;

      if (source.x == null || source.y == null || target.x == null || target.y == null) continue;

      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) dist = 1e-3;

      const delta = dist - this.settings.linkDistance;
      const springForce = delta * this.settings.linkStrength * this.alpha;
      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      if (source.fx == null) {
        source.vx! += fx;
        source.vy! += fy;
      }
      if (target.fx == null) {
        target.vx! -= fx;
        target.vy! -= fy;
      }
    }

    // 4. Position Updates and Velocity Damping
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i];
      if (node.fx != null && node.fy != null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
      } else {
        node.vx! *= this.settings.damping;
        node.vy! *= this.settings.damping;
        node.x! += node.vx!;
        node.y! += node.vy!;
      }
    }

    this.alpha *= 1 - this.settings.alphaDecay;
  }
}
```

### 3.5 Wikilink Autocomplete Hook

```typescript
// src/hooks/useWikilinkAutoComplete.ts
import { useState, useCallback, useMemo } from 'react';
import type { Note } from '../types/models';

export interface SuggestionMatch {
  title: string;
  slug: string;
  isExisting: boolean;
}

/**
 * Hook managing Wikilink auto-complete popup state and keyboard indexing.
 * Consumer contract: The parent editor controls dismissal upon unmount or mode switch.
 */
export function useWikilinkAutoComplete(notes: Note[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [triggerRange, setTriggerRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const suggestions: SuggestionMatch[] = useMemo(() => {
    if (!isOpen) return [];
    const cleanQuery = query.toLowerCase().trim();
    const existing = notes
      .filter((n) => n.title.toLowerCase().includes(cleanQuery))
      .map((n) => ({
        title: n.title,
        slug: n.slug,
        isExisting: true,
      }));

    const exactMatch = notes.some((n) => n.title.toLowerCase() === cleanQuery);
    if (!exactMatch && cleanQuery.length > 0) {
      existing.push({
        title: query,
        slug: query.toLowerCase().replace(/\s+/g, '-'),
        isExisting: false,
      });
    }

    return existing.slice(0, 8);
  }, [notes, query, isOpen]);

  const handleEditorInput = useCallback(
    (
      text: string,
      cursorOffset: number,
      coordCalculator: (offset: number) => { top: number; left: number }
    ) => {
      const textBeforeCursor = text.slice(0, cursorOffset);
      const openIdx = textBeforeCursor.lastIndexOf('[[');
      const closeIdx = textBeforeCursor.lastIndexOf(']]');

      if (openIdx !== -1 && openIdx > closeIdx) {
        const rawQuery = textBeforeCursor.slice(openIdx + 2);
        if (!rawQuery.includes('\n')) {
          setIsOpen(true);
          setQuery(rawQuery);
          setTriggerRange({ start: openIdx, end: cursorOffset });
          setCursorPosition(coordCalculator(openIdx));
          setSelectedIndex(0);
          return true;
        }
      }

      setIsOpen(false);
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally empty: all state setters are stable refs
    []
  );

  return {
    isOpen,
    setIsOpen,
    query,
    cursorPosition,
    triggerRange,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    handleEditorInput,
  };
}
```

---

## 4. 5-Phase Sequential Queue

```
[ ] Phase 1: Types, Storage/API Client Config, and Base Utilities
[ ] Phase 2: Design Foundation & Atomic UI Primitives
[ ] Phase 3: Compound Molecules & Feature Components
[ ] Phase 4: Domain Logic, Reactive State, and Specialized APIs
[ ] Phase 5: Complete Page/Screen Assembly & Responsive Shell
```

---

### Phase 1: Types, Storage/API Client Config, and Base Utilities

- [ ] Define comprehensive TypeScript models in `src/types/models.ts` covering `Note`, `Folder`, `WikiLink`, `NoteLink`, `BacklinkItem`, `GraphNode`, `RawGraphEdge`, `ResolvedGraphEdge`, `GraphPhysicsSettings`, `GraphFilterSettings`, `UserPreferences`, and `SearchResult`.
- [ ] Initialize lazy Dexie DB factory `getDb()` in `src/services/db/schema.ts` defining indexed stores: `notes` (`id, slug, title, folderId, createdAt, updatedAt, isPinned, isArchived`), `folders` (`id, parentId, name, createdAt`), and `links` (`id, sourceNoteId, targetSlug, targetNoteId`). Install dependencies using latest versions: `dexie`, `dexie-react-hooks`, `js-yaml`, and dev dependency `@types/js-yaml`. Note: All occurrences across all components, hooks, and services must reference the database via `getDb()` rather than a module-level `db`.
- [ ] Implement `genId()` in `src/utils/id.ts` supporting `crypto.randomUUID()`, `crypto.getRandomValues()`, and fallback.
- [ ] Implement `slugify()` with Node/browser non-Latin fallbacks and `escapeRegex()` in `src/utils/slug.ts`.
- [ ] Implement `src/utils/format.ts` for note metadata, reading time calculations, and file sizes.
- [ ] Build idempotent initial database seeder in `src/services/db/seed.ts` with deterministic fixed IDs (`seed-note-1` through `seed-note-4`) guarded by `await getDb().notes.count() === 0`:
  - `seed-note-1`: "Welcome to Obsidian Clone"
  - `seed-note-2`: "Graph Theory & Network Thinking"
  - `seed-note-3`: "Markdown Syntax Reference"
  - `seed-note-4`: "Second Brain Architecture"

---

### Phase 2: Design Foundation & Atomic UI Primitives

- [ ] Configure Tailwind CSS v4 `@theme` block in `src/globals.css`:
  ```css
  @import "tailwindcss";

  @theme {
    --color-canvas: #090d16;
    --color-surface: #0f172a;
    --color-elevated: #1e293b;
    --color-border: #334155;
    --color-node-cyan: #38bdf8;
    --color-node-purple: #a855f7;
    --color-node-amber: #fbbf24;
    --color-node-rose: #fb7185;
    --color-text-main: #f1f5f9;
    --color-text-muted: #94a3b8;
    --color-text-subtle: #64748b;
  }
  ```
- [ ] Implement `src/components/ui/Button.tsx`:
  - Variants: `primary`, `secondary`, `ghost`, `danger`.
  - Touch targets: Minimum 44x44px bounding area on mobile.
- [ ] Implement `src/components/ui/IconButton.tsx` with aria-label, tooltip integration, and active state indicators.
- [ ] Implement `src/components/ui/Input.tsx` and `Textarea.tsx` with focus rings (`focus:ring-1 focus:ring-cyan-500`) and zero iOS zoom (`text-base md:text-sm`).
- [ ] Implement `src/components/ui/Modal.tsx` using React Portal with `bg-black/70 backdrop-blur-sm` (low GPU overhead on mobile), escape-key listener, and mobile bottom-sheet slide-up animation.
- [ ] Implement `src/components/ui/DropdownMenu.tsx` with viewport collision detection and touch dismissal.
- [ ] Implement `src/components/ui/Slider.tsx` for physics tuning with numerical readout.
- [ ] Implement `src/components/ui/Switch.tsx` with accessible keyboard toggle and animated thumb.
- [ ] Implement `src/components/ui/Badge.tsx` for tags and link count metrics.
- [ ] Implement `src/components/ui/Tooltip.tsx` supporting pointer hover on desktop and disabled on touch devices.

---

### Phase 3: Compound Molecules & Feature Components

- [ ] Implement `src/components/molecules/SearchBar.tsx`:
  - Input field with leading search icon, clear button, and hotkey indicator (`Cmd+K`).
- [ ] Implement `src/components/molecules/TreeItem.tsx`:
  - Hierarchical folder/note item with collapsible chevron, active state highlight, context menu trigger, and touch drag handle.
- [ ] Implement `src/components/molecules/TagBadge.tsx`:
  - Clickable `#tag` pill triggering tag filter in graph or search view.
- [ ] Implement `src/components/molecules/WikilinkSuggestPopover.tsx`:
  - Adaptive positioning: renders as floating popover at cursor coordinates on desktop (`pointer: fine`), and as a fixed bottom drawer on touch/mobile (`pointer: coarse`).
  - Arrow up/down navigation, `Enter` or `Tab` to select, and "Create new note: [[...]]" item when target note does not exist.
- [ ] Implement `src/components/molecules/ConfirmDialog.tsx` for note or folder deletions.
- [ ] Implement `src/components/molecules/TabNavigation.tsx` for switching views (Edit, Preview, Split, Graph) with accessible ARIA tablist markup.
- [ ] Implement `src/components/domain/sidebar/FileExplorer.tsx`:
  - Nested folder tree rendering with active note indicators.
  - Action buttons: "New Note", "New Folder", "Collapse All".
  - Pin section at top for starred notes.
- [ ] Implement `src/components/domain/sidebar/TagExplorer.tsx`:
  - Aggregated list of all `#tags` across all notes with note counts.
- [ ] Implement `src/components/domain/inspector/BacklinksList.tsx`:
  - Renders all notes linking to the current active note using `getDb().links`.
  - Contextual snippet extraction around `[[wikilink]]` occurrences.
  - Lists unlinked mentions with a "Link" conversion button.
- [ ] Implement `src/components/domain/inspector/OutgoingLinksList.tsx`:
  - Renders outgoing links partitioned into Resolved and Unresolved (ghost) notes.
- [ ] Implement `src/components/domain/palette/CommandPalette.tsx`:
  - Modal triggered via `Cmd+P` / `Ctrl+P` or mobile button.
  - Action commands: note creation, graph toggles, theme adjustments, database export.
- [ ] Implement `src/components/domain/palette/QuickSwitcherModal.tsx`:
  - Modal triggered via `Cmd+O` / `Ctrl+O`.
  - Real-time search across titles and frontmatter aliases for note switching.

---

### Phase 4: Domain Logic, Reactive State, and Specialized APIs

- [ ] Implement custom reactive hook `src/hooks/useNotes.ts` using `useLiveQuery` from `dexie-react-hooks`:
  - Concurrency & race condition guard: per-note write-lock (`inFlightWritesRef = new Set<string>()`) skipping obsolete writes during debounced rapid typing.
  - CRUD operations:
    - `createNote(title, folderId?)`: Validates and de-duplicates slug by querying `getDb().notes.where('slug').equals(slug).count()` and appending `-2`, `-3` on collisions.
    - `updateNoteContent(id, content)`: Updates `content` and `updatedAt: Date.now()`. Re-parses wikilinks using `extractWikilinks`, performs batch overwrite in `getDb().links` for `sourceNoteId === id` ensuring persistent indexed link records.
    - `renameNote(id, newTitle)`: Generates de-duplicated `newSlug`. In a single atomic transaction block `getDb().transaction('rw', [getDb().notes, getDb().links], async () => { ... })`:
      - Updates source note's own `title`, `slug`, and `updatedAt`.
      - Builds regex `new RegExp('\\[\\[' + escapeRegex(oldTitle) + '(\\|[^\\]]*)?\\]\\]', 'g')`.
      - Scans other notes and replaces targets via functional callback:
        ```typescript
        // alias capture group includes leading pipe character, e.g. alias === '|My Alias', concatenation is correct as-is
        content.replace(pattern, (_, alias) => (alias ? '[[' + newTitle + alias + ']]' : '[[' + newTitle + ']]'));
        ```
      - Re-indexes affected `getDb().links` records.
    - `deleteNote(id)`: Cascades deletion to remove `sourceNoteId === id` and `targetNoteId === id` from `getDb().links`.
    - `togglePin(id)`: Toggles `isPinned` and touches `updatedAt`.
- [ ] Implement `src/services/markdown/renderer.ts`:
  - Markdown renderer parsing headings, bold, italic, code blocks, lists, blockquotes, and tables.
  - Intercepts `[[target|alias]]` syntax and renders clickable spans that trigger navigation.
  - Renders `#tags` as clickable filter pills.
- [ ] Implement `src/components/domain/editor/MarkdownEditor.tsx`:
  - Textarea with line numbers and auto-indentation.
  - Frontmatter parsing via `parseFrontmatter`.
  - List continuation on `Enter` (`- [ ] `, `* `, `1. `).
  - Integrates `useWikilinkAutoComplete`.
- [ ] Implement `src/components/domain/editor/EditorToolbar.tsx`:
  - Quick format buttons: Bold (`**`), Italic (`*`), Heading (`#`), Link (`[[]]`), Task list (`- [ ] `), Code block.
  - Toolbar container uses `overflow-x-auto scrollbar-none flex-nowrap shrink-0` to eliminate wrapping and layout shifts at 360px.
- [ ] Implement `src/services/graph/forceEngine.ts`:
  - 2D Canvas force layout with Barnes-Hut repulsion, spring distance links, damping, velocity Verlet integration.
  - Touch and mouse gesture handlers: pan, pinch-to-zoom, node drag pinning (`fx, fy`).
  - High-DPI support (`window.devicePixelRatio`) with clean label rendering.
  - Distance-based hit testing for pointer click and hover states.
- [ ] Implement `src/components/domain/graph/ForceGraphCanvas.tsx`:
  - Canvas resize observer lifecycle, physics engine instantiation, and theme updates.
  - Controls overlay: Zoom In, Zoom Out, Reset Center, Pause/Play physics, Graph Settings popover.
- [ ] Implement `src/components/domain/graph/LocalGraphView.tsx`:
  - Scoped graph centered on the active note, filtering nodes to a depth of 1 or 2 hops.
- [ ] Implement `src/components/domain/graph/GraphControls.tsx`:
  - Sliders for Force Strength, Link Distance, Collision Radius.
  - Toggles for Show Orphans, Show Tags, Show Unresolved Notes.

---

### Phase 5: Complete Page/Screen Assembly & Responsive Shell

- [ ] Implement `src/components/shell/AppHeader.tsx`:
  - Left: Hamburger toggle (mobile) / File explorer toggle (desktop), breadcrumbs.
  - Center: Note title inline editable or quick switcher trigger button.
  - Right: View mode selector (Editor, Split, Graph Canvas), Inspector toggle, Quick Switcher (`Cmd+O`).
- [ ] Implement `src/components/shell/SplitPaneContainer.tsx`:
  - Desktop: Multi-column layout with draggable separator handles. Separator has `touch-action: none` and an invisible hit area of `w-4` (16px) with visual `w-[1px]` border.
  - Mobile (<768px): Draggable separator is hidden (`hidden md:block`); active view toggles fully between Editor and Graph.
- [ ] Implement `src/components/shell/MobileNavBar.tsx`:
  - Fixed bottom bar on viewports `< 768px`:
    - Viewports < 390px (360px): Icon-only with `sr-only` labels to prevent wrapping.
    - Viewports >= 390px: Icon with 10px text labels.
    - Actions: [1] Explorer, [2] Search, [3] Edit, [4] Graph, [5] Backlinks.
  - Safe area inset padding (`pb-safe` / `env(safe-area-inset-bottom)`).
- [ ] Implement `src/components/shell/MobileDrawer.tsx`:
  - Touch-swipeable sheet from left (File Explorer) and right (Backlinks & Local Graph) with backdrop scrim.
- [ ] Implement Root Application Shell `src/App.tsx`:
  - Runs database seeder on initial boot if `await getDb().notes.count() === 0`.
  - Global keyboard listener:
    - `Cmd+O` / `Ctrl+O`: Quick Switcher
    - `Cmd+P` / `Ctrl+P`: Command Palette
    - `Cmd+E` / `Ctrl+E`: Toggle Edit / Preview
    - `Cmd+G` / `Ctrl+G`: Toggle Graph Canvas
  - State management for active note, search query, panel visibility, and view mode.
- [ ] Validate responsive behavior and touch interaction across target viewports:
  - 360px (Small Android: e.g. Galaxy S8)
  - 390px (Standard iPhone 12/13/14)
  - 430px (iPhone 14/15/16 Pro Max)
  - 768px (iPad Mini / Portrait Tablet)
  - 1024px+ (Desktop Full Screen)
- [ ] Implement Data Import / Export utility:
  - Export all notes as a downloadable JSON backup or Zip archive of `.md` files.
  - Import `.md` markdown files directly into IndexedDB, preserving wikilinks and folder structures.

---

## 5. Technical Guarantees & Constraints

- **Offline-First Data Storage**: Complete client-side operation with IndexedDB via Dexie.js and `dexie-react-hooks`. Zero external server dependencies.
- **Relational Integrity**: Slug updates, link re-indexing, and markdown content cascade renames execute inside single atomic Dexie read-write transactions.
- **Type Safety**: Separate `RawGraphEdge` and `ResolvedGraphEdge` definitions ensure strictly typed compiler-verified physics updates without runtime type errors.
- **Simulation Performance**: 60 FPS HTML5 Canvas engine with high-DPI device pixel ratio scaling, velocity Verlet numerical integration, and physics temperature cooling (`alphaDecay`).
- **Touch-First Accessibility**: Every feature remains fully operable on mobile viewports down to 360px without relying on hover states, utilizing touch-sized tap targets (minimum 44x44px) and bottom drawers.