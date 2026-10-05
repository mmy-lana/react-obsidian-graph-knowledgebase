import React from 'react';
import { Archive, CalendarClock, Copy, FileText, Hash, Tag as TagIcon } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { TagBadge } from '../../molecules/TagBadge';
import { analyzeText, formatDate, formatRelativeTime } from '../../../utils/format';
import type { Note } from '../../../types/models';

export interface NoteMetadataProps {
  note: Note | null;
  onSelectTag?: (tag: string) => void;
  onCopyLink?: (note: Note) => void;
  className?: string;
  testId?: string;
}

interface MetadataRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function MetadataRow({ icon, label, value }: MetadataRowProps) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 text-[11px] text-text-subtle">
        <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </span>
      <span className="text-right text-[11px] text-text-muted" data-testid={`meta-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </span>
    </div>
  );
}

/** Read-only metadata panel for the active note. */
export function NoteMetadata({
  note,
  onSelectTag,
  onCopyLink,
  className = '',
  testId = 'note-metadata',
}: NoteMetadataProps) {
  if (!note) {
    return (
      <section
        className={['p-3 text-xs text-text-subtle', className].filter(Boolean).join(' ')}
        data-testid={testId}
      >
        No note selected.
      </section>
    );
  }

  const stats = analyzeText(note.content);
  const tags = note.frontmatter.tags ?? [];
  const aliases = note.frontmatter.aliases ?? [];

  return (
    <section
      className={['flex flex-col gap-2.5 rounded-lg border border-border bg-canvas p-2.5', className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-text-main">
          <FileText className="h-3.5 w-3.5 shrink-0 text-node-cyan" />
          <span className="truncate">{note.title}</span>
        </h3>

        {onCopyLink ? (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Copy />}
            onClick={() => onCopyLink(note)}
            className="shrink-0 px-2"
            testId="copy-wikilink"
          >
            Link
          </Button>
        ) : null}
      </header>

      {note.isArchived ? (
        <Badge tone="warning" icon={<Archive />} size="sm">
          Archived
        </Badge>
      ) : null}

      <div className="divide-y divide-border/60">
        <MetadataRow icon={<FileText />} label="Slug" value={<code className="text-[10px]">{note.slug}</code>} />
        <MetadataRow icon={<Hash />} label="Words" value={stats.words.toLocaleString()} />
        <MetadataRow icon={<Hash />} label="Read" value={`${stats.minutes} min`} />
        <MetadataRow
          icon={<CalendarClock />}
          label="Created"
          value={`${formatDate(note.createdAt)} (${formatRelativeTime(note.createdAt)})`}
        />
        <MetadataRow
          icon={<CalendarClock />}
          label="Updated"
          value={`${formatDate(note.updatedAt, true)} (${formatRelativeTime(note.updatedAt)})`}
        />
      </div>

      {aliases.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle">Aliases</span>
          {aliases.map((alias) => (
            <Badge key={alias} size="sm" tone="neutral" testId={`alias-${alias}`}>
              {alias}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <TagIcon className="h-3 w-3 text-text-subtle" aria-hidden="true" />
        {tags.length === 0 ? (
          <span className="text-[11px] text-text-subtle">No tags</span>
        ) : (
          tags.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              size="sm"
              onClick={onSelectTag}
              testId={`meta-tag-${tag}`}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default NoteMetadata;