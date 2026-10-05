# Personal Knowledge Base Network (Obsidian Clone)

A local-first, offline-capable personal knowledge base and bi-directional graph visualization engine built with React, TypeScript, Tailwind CSS, and Dexie.js (IndexedDB).

- **Repository**: [https://github.com/mmy-lana/react-obsidian-graph-knowledgebase](https://github.com/mmy-lana/react-obsidian-graph-knowledgebase)
- **Live Demo**: [https://react-obsidian-graph-knowledgebase.vercel.app/](https://react-obsidian-graph-knowledgebase.vercel.app/)

---

## Overview

This application delivers a desktop-grade markdown note-taking environment modeled after Obsidian. Notes are written locally to the browser's IndexedDB, parsed for bidirectional `[[wikilinks]]` and `#tags`, and rendered as an interactive, real-time 60 FPS force-directed network on an HTML5 2D Canvas.

### Architectural Highlights

- **Zero Server Dependencies**: Entirely offline-first. Notes, folders, frontmatter, and link indices live directly inside IndexedDB via Dexie.js.
- **Atomic Relational Cascades**: Renaming a note updates the note title, slug, frontmatter, and every referencing `[[wikilink]]` across all other notes inside an atomic read-write transaction.
- **High-Performance 2D Canvas Engine**: Custom particle simulation engine featuring velocity Verlet integration, spring-electrical physics, Barnes-Hut quadtree repulsion for $N > 60$ nodes, and high-DPI retina display support.
- **Calibrated Trackpad & Touch Navigation**: Smooth focal zoom anchored to mouse cursor coordinates, native macOS trackpad pinch damping, two-finger panning isolation, and automatic initial camera framing.
- **Mobile-First Responsive Shell**: Adapts seamlessly from 360px mobile viewports up to wide desktop screens with touch-first drawers, persistent bottom navigation, and zero essential hover dependencies.

---

## Features

### Markdown Authoring & Live Preview
- Split, source, and preview view modes.
- Real-time YAML frontmatter parser and editor (`title`, `aliases`, `tags`, `created`, `updated`).
- `[[wikilink]]` auto-completion popup triggered on typing `[[`, supporting keyboard navigation (`Up`/`Down`/`Enter`) and instant note creation for unresolved targets.
- Markdown feature support: ATX headings, task lists (`- [ ]`, `- [x]`), pipe tables, fenced code blocks, blockquotes with recursion limits, inline code, bold, italic, and tags.
- Protocol sanitization: Strips unsafe image schemes (`javascript:`, `vbscript:`, `data:text/html`, `file:`) while allowing `https:`, `http:`, `data:image/`, `/`, and `#`.

### Force-Directed Graph Visualization
- **Global Graph Canvas**: Renders all notes, tags, and unresolved ghost links.
- **Local Graph Inspector**: Neighborhood visualization focused on the active note with selectable depth (1 hop or 2 hops).
- **Physics Tuning Controls**: Real-time adjustable sliders for charge repulsion, link distance, link strength, and collision radius.
- **Visibility Toggles**: Toggle orphan notes, tag nodes, unresolved ghost nodes, and text labels.
- **Camera Controls**: Zoom in/out, fit to view, reset view, pause/play simulation, and center on active note.
- **Gesture Support**: Cursor-anchored wheel zooming, trackpad pinch scaling with exponential damping, two-finger panning, and click-and-drag node pinning.

### File Explorer & Organization
- Hierarchical folder tree with expand/collapse states and child counters.
- Pinned notes quick-access section.
- Aggregated `#tag` explorer with frequency badges and search filtering.
- Context menus for renaming, moving, and deleting notes or folders.
- Recursive subtree deletion preventing dangling folder references.

### Bidirectional Link Engine
- **Backlinks Panel**: Inspects inbound links with contextual excerpt snippets centered on link targets.
- **Unlinked Mentions**: Detects text occurrences of note titles without wikilink brackets and provides a one-click "Link" conversion affordance.
- **Outgoing Links Panel**: Partitions links into resolved notes and unresolved ghost targets.

### Vault Management & Portability
- **JSON Vault Backup**: Complete database backup and restoration with format assertion and schema validation.
- **Markdown Batch Export**: Downloads notes as individual `.md` files preserving frontmatter and folder paths, with download pacing to prevent browser popup blocking.
- **Markdown Batch Import**: Multi-file and directory upload that resolves folders, merges identical slugs, and re-indexes the graph atomically.

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Cmd/Ctrl + P` | Open Command Palette | Global |
| `Cmd/Ctrl + O` | Open Quick Switcher | Global |
| `Cmd/Ctrl + G` | Toggle Graph Canvas View | Global |
| `Cmd/Ctrl + E` | Toggle Source / Preview Editor | Global |
| `Cmd/Ctrl + K` | Focus Search Input | Global |
| `Escape` | Dismiss Modals, Popovers, and Drawers | Modal / Surface |
| `Enter` / `Tab` | Confirm Autocomplete Selection | Editor |
| `Arrow Keys` | Roving Tab Navigation & List Selection | Lists / Controls |

---

## Tech Stack

- **Runtime & UI**: React, TypeScript, HTML5 2D Canvas API
- **Styling**: Tailwind CSS (v4 CSS-first `@theme` configuration)
- **Database & Storage**: Dexie.js, `dexie-react-hooks` (IndexedDB)
- **Icons**: Lucide React
- **Serialization**: `js-yaml`
- **Build Tool**: Vite
- **Package Manager**: pnpm (strict)

---

## Directory Structure

```
src/
├── components/
│   ├── domain/
│   │   ├── editor/           # Markdown editor, preview, toolbar, frontmatter panel
│   │   ├── graph/            # ForceGraphCanvas, LocalGraphView, legend, controls
│   │   ├── inspector/        # BacklinksList, OutgoingLinksList, NoteMetadata
│   │   ├── palette/          # CommandPalette, QuickSwitcherModal
│   │   └── sidebar/          # FileExplorer, FolderTree, TagExplorer, NewNoteButton
│   ├── molecules/            # ConfirmDialog, PromptDialog, SearchBar, TabNavigation, etc.
│   ├── shell/                # AppLayout, AppHeader, MobileNavBar, MobileDrawer, SplitPane
│   └── ui/                   # Button, IconButton, Input, Textarea, Modal, Slider, Switch, Badge
├── hooks/                    # useNotes, useGraphSimulation, useCommandPalette, useDebounce, etc.
├── services/
│   ├── db/                   # Dexie schema, seeder, vault import/export transfer engine
│   ├── graph/                # forceEngine (physics simulation), graphBuilder (topology)
│   └── markdown/             # parser (wikilinks, frontmatter, tags), renderer (HTML generation)
├── types/                    # Pure TypeScript models and interfaces
├── utils/                    # id, slug, formatting utilities
├── App.tsx                   # Main root application component
├── globals.css               # Tailwind tokens and base layers
└── main.tsx                  # Application bootstrap entry point
```

---

## Getting Started

### Prerequisites

- Node.js (version 18 or later recommended)
- `pnpm` (Corepack or standalone install: `npm install -g pnpm`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mmy-lana/react-obsidian-graph-knowledgebase.git
   cd react-obsidian-graph-knowledgebase
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Development

Start the local Vite development server:
```bash
pnpm dev
```
Open your browser at `http://localhost:5173`.

### Production Build

Typecheck and compile the production bundle:
```bash
pnpm build
```

Preview the production build locally:
```bash
pnpm preview
```

---

## Verification & Automated Test Harness

The project includes an integrated headless Chrome verification harness communicating directly via Chrome DevTools Protocol (CDP) over WebSocket.

The suite verifies modules and full application behavior across 5 viewports:
- `360-compact-mobile` (360x740)
- `390-standard-mobile` (390x844)
- `430-pro-mobile` (430x932)
- `768-tablet` (768x1024)
- `1440-desktop` (1440x900)

### Running Verification

Run TypeScript strict typechecking:
```bash
pnpm typecheck
```

Run the complete verification test harness:
```bash
pnpm verify
```

Run phase-specific verification suites:
```bash
node verify/run.mjs phase1   # Utilities, markdown parser, Dexie storage, seeder
node verify/run.mjs phase2   # Atomic UI primitives, design tokens, modal scroll locks
node verify/run.mjs phase3   # Compound components, file explorer, backlinks, command palette
node verify/run.mjs phase4   # Reactive notes API, graph physics engine, canvas rendering
node verify/run.mjs phase5   # Import/export transfer, responsive layout checks across viewports
```

---

## Data Model

```typescript
export interface Note {
  id: string;
  slug: string;
  title: string;
  content: string;
  folderId: string | null;
  frontmatter: Frontmatter;
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  isArchived: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface NoteLink {
  id: string;
  sourceNoteId: string;
  targetSlug: string;
  targetNoteId: string | null;
  alias: string | null;
  createdAt: number;
}
```

---

## License

This project is open-source and available under the [MIT License](LICENSE).
