import type { Folder, Note, NoteLink } from '../../types/models';
import { extractWikilinks } from '../markdown/parser';
import { slugify } from '../../utils/slug';
import { buildLinkId, getDb } from './schema';

/**
 * Idempotent first-run content. Every row uses a deterministic primary key so a
 * re-seed after a partial write converges instead of duplicating notes.
 */
const SEED_FOLDERS: Folder[] = [
  { id: 'seed-folder-1', name: 'Foundations', parentId: null, createdAt: 1_700_000_000_000 },
  { id: 'seed-folder-2', name: 'Reference', parentId: null, createdAt: 1_700_000_000_000 },
];

const NOTE_1_BODY = `# Welcome to Obsidian Clone

This workspace is a **local-first** personal knowledge base. Everything you write
stays in your browser: notes live in IndexedDB and the links between them are
indexed for instant graph rendering.

## Start here

1. Create a note from the sidebar, or press \`Cmd/Ctrl + P\` for the command palette.
2. Type \`[[\` anywhere in the editor to link another note — autocomplete suggests existing titles.
3. Open the graph with \`Cmd/Ctrl + G\` and watch your ideas connect themselves.

Related reading: [[Graph Theory & Network Thinking]] and [[Second Brain Architecture]].

## Why links matter

A note on its own is a document. A note *connected* to others becomes a
knowledge graph — see [[Markdown Syntax Reference]] for the authoring syntax.

Tags: #welcome #onboarding`;

const NOTE_2_BODY = `# Graph Theory & Network Thinking

Graphs turn scattered notes into a navigable structure. Every note is a **node**,
and every wikilink between two notes is an **edge**.

## Core vocabulary

| Term | Meaning |
| --- | --- |
| Node | A single note (or a tag / unresolved link placeholder) |
| Edge | A directed link between two notes |
| Degree | How many edges touch a node — high degree notes are hubs |

## Force-directed layout

The renderer runs a spring-electrical model: edges pull connected nodes toward
their ideal distance, while every pair of nodes repels each other. Cooling
(an "alpha" temperature) prevents endless jitter once the layout settles.

Targets that do not exist yet — such as [[Zettelkasten Method]] — stay visible
in the graph as ghost nodes until the note is created.

Start from [[Welcome to Obsidian Clone]] and read about personal application in
[[Second Brain Architecture]].

Tags: #graph #theory`;

const NOTE_3_BODY = `# Markdown Syntax Reference

Authoring cheatsheet for the editor.

## Text

- **Bold** and *italic* and ~~strikethrough~~ and \`inline code\`
- [x] Completed tasks
- [ ] Open tasks

## Code

\`\`\`ts
const note = await getDb().notes.get(id);
\`\`\`

> Blockquotes capture a highlighted excerpt.
> Use them for literature notes.

## Links and tags

Write [[Graph Theory & Network Thinking|graph theory]] to alias a link, and
reference [[Second Brain Architecture]] directly. Tags such as #reference and
#markdown become filterable nodes in the graph.

Tags: #reference #markdown`;

const NOTE_4_BODY = `# Second Brain Architecture

A second brain is an externalised thought system: capture, organise, express,
then review. The tool is irrelevant — the loop is everything.

## Capture

Everything is one keystroke away. \`[[\` opens note creation with the title
already attached to your current sentence.

## Organise

Folders give a shallow hierarchy; links give a deep one. Prefer descriptive
titles over deep nesting — see [[Graph Theory & Network Thinking]] for why
link structure beats folder structure over time.

## Express

Publish daily notes, answer the open questions, and revisit old hubs until new
connections appear. The graph view makes orphaned thinking visible.

Reference the authoring rules in [[Markdown Syntax Reference]].

Tags: #pkm #architecture`;

interface SeedNoteDefinition {
  id: string;
  title: string;
  folderId: string | null;
  isPinned: boolean;
  aliases: string[];
  body: string;
}

const SEED_NOTES: SeedNoteDefinition[] = [
  {
    id: 'seed-note-1',
    title: 'Welcome to Obsidian Clone',
    folderId: null,
    isPinned: true,
    aliases: ['Start Here', 'Home'],
    body: NOTE_1_BODY,
  },
  {
    id: 'seed-note-2',
    title: 'Graph Theory & Network Thinking',
    folderId: 'seed-folder-1',
    isPinned: false,
    aliases: ['Graph Theory'],
    body: NOTE_2_BODY,
  },
  {
    id: 'seed-note-3',
    title: 'Markdown Syntax Reference',
    folderId: 'seed-folder-2',
    isPinned: false,
    aliases: ['Markdown Cheatsheet'],
    body: NOTE_3_BODY,
  },
  {
    id: 'seed-note-4',
    title: 'Second Brain Architecture',
    folderId: 'seed-folder-1',
    isPinned: false,
    aliases: ['Zettelkasten'],
    body: NOTE_4_BODY,
  },
];

const SEED_TIMESTAMP = 1_700_000_000_000;

const buildSeedNotes = (): Note[] =>
  SEED_NOTES.map((definition) => ({
    id: definition.id,
    slug: slugify(definition.title),
    title: definition.title,
    content: definition.body,
    folderId: definition.folderId,
    frontmatter: {
      title: definition.title,
      aliases: definition.aliases,
      tags: [`/seed`],
      created: new Date(SEED_TIMESTAMP).toISOString().slice(0, 10),
      updated: new Date(SEED_TIMESTAMP).toISOString().slice(0, 10),
    },
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    isPinned: definition.isPinned,
    isArchived: false,
  }));

/** Index the wikilinks of the seeded notes so backlinks resolve immediately. */
const buildSeedLinks = (notes: Note[]): NoteLink[] => {
  const bySlug = new Map(notes.map((note) => [note.slug, note]));
  const links: NoteLink[] = [];

  for (const note of notes) {
    for (const wikilink of extractWikilinks(note.content)) {
      const target = bySlug.get(wikilink.targetSlug);
      const id = buildLinkId(note.id, wikilink.targetSlug);
      if (links.some((link) => link.id === id)) continue;

      links.push({
        id,
        sourceNoteId: note.id,
        targetSlug: wikilink.targetSlug,
        targetNoteId: target ? target.id : null,
        alias: wikilink.alias ?? null,
        createdAt: SEED_TIMESTAMP,
      });
    }
  }

  return links;
};

/**
 * Populate an empty database with the four starter notes, two folders, and the
 * link index connecting them.
 *
 * @returns the seeded notes, or `null` when data already existed (no-op).
 */
export const seedDatabaseIfEmpty = async (): Promise<Note[] | null> => {
  const db = getDb();
  const existingCount = await db.notes.count();

  if (existingCount > 0) {
    return null;
  }

  const notes = buildSeedNotes();
  const folders = SEED_FOLDERS;
  const links = buildSeedLinks(notes);

  await db.transaction('rw', [db.notes, db.folders, db.links], async () => {
    await db.folders.bulkPut(folders);
    await db.notes.bulkPut(notes);
    await db.links.bulkPut(links);
  });

  return notes;
};

/** Note id of the welcome note, used as the default selection after seeding. */
export const SEED_DEFAULT_NOTE_ID = 'seed-note-1';

export const SEED_NOTE_IDS = {
  welcome: 'seed-note-1',
  graphTheory: 'seed-note-2',
  markdown: 'seed-note-3',
  secondBrain: 'seed-note-4',
} as const;