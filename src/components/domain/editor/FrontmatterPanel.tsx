import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Badge } from '../../ui/Badge';
import { TagBadge } from '../../molecules/TagBadge';
import { formatDate } from '../../../utils/format';
import type { Frontmatter, Note } from '../../../types/models';

export interface FrontmatterPanelProps {
  note: Note | null;
  onChange: (frontmatter: Frontmatter) => void;
  onSelectTag?: (tag: string) => void;
  className?: string;
  testId?: string;
}

interface DraftState {
  title: string;
  aliases: string[];
  tags: string[];
  created: string;
  updated: string;
}

const draftFrom = (note: Note | null): DraftState => ({
  title: note?.frontmatter.title ?? note?.title ?? '',
  aliases: [...(note?.frontmatter.aliases ?? [])],
  tags: [...(note?.frontmatter.tags ?? [])],
  created: note?.frontmatter.created ?? (note ? new Date(note.createdAt).toISOString().slice(0, 10) : ''),
  updated: note?.frontmatter.updated ?? (note ? new Date(note.updatedAt).toISOString().slice(0, 10) : ''),
});

/**
 * Structured editor for the YAML frontmatter block of the active note.
 * Changes are applied immediately through `onChange`.
 */
export function FrontmatterPanel({ note, onChange, onSelectTag, className = '', testId = 'frontmatter-panel' }: FrontmatterPanelProps) {
  const [draft, setDraft] = useState<DraftState>(() => draftFrom(note));
  const [newAlias, setNewAlias] = useState('');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setDraft(draftFrom(note));
    setNewAlias('');
    setNewTag('');
  }, [note?.id]);

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

  const publish = (next: DraftState) => {
    setDraft(next);
    onChange({
      title: next.title.trim() || note.title,
      aliases: next.aliases.length > 0 ? next.aliases : undefined,
      tags: next.tags.length > 0 ? next.tags : undefined,
      created: next.created || undefined,
      updated: next.updated || undefined,
    });
  };

  return (
    <section
      className={['flex flex-col gap-3 p-3', className].filter(Boolean).join(' ')}
      aria-label="Frontmatter"
      data-testid={testId}
    >
      <Input
        label="Title"
        value={draft.title}
        onChange={(event) => publish({ ...draft, title: event.target.value })}
        testId="frontmatter-title"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted">Aliases</span>

        {draft.aliases.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {draft.aliases.map((alias) => (
              <li key={alias}>
                <Badge tone="info" size="sm" icon={null} testId={`frontmatter-alias-${alias}`}>
                  <span className="mr-1">{alias}</span>
                  <IconButton
                    label={`Remove alias ${alias}`}
                    icon={<X />}
                    size="sm"
                    tooltip={false}
                    className="h-4 w-4"
                    onClick={() => publish({ ...draft, aliases: draft.aliases.filter((item) => item !== alias) })}
                  />
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-text-subtle">No aliases yet.</p>
        )}

        <div className="flex items-center gap-1">
          <Input
            size="sm"
            hideLabel
            label="New alias"
            placeholder="Add alias…"
            value={newAlias}
            onChange={(event) => setNewAlias(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = newAlias.trim();
              if (!value || draft.aliases.includes(value)) return;
              publish({ ...draft, aliases: [...draft.aliases, value] });
              setNewAlias('');
            }}
            testId="frontmatter-alias-input"
          />
          <IconButton
            label="Add alias"
            icon={<Plus />}
            disabled={newAlias.trim().length === 0}
            onClick={() => {
              const value = newAlias.trim();
              if (!value || draft.aliases.includes(value)) return;
              publish({ ...draft, aliases: [...draft.aliases, value] });
              setNewAlias('');
            }}
            data-testid="frontmatter-add-alias"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted">Tags</span>

        {draft.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {draft.tags.map((tag) => (
              <li key={tag} className="flex items-center gap-1">
                <TagBadge tag={tag} size="sm" active onClick={onSelectTag} testId={`frontmatter-tag-${tag}`} />
                <IconButton
                  label={`Remove tag ${tag}`}
                  icon={<X />}
                  size="sm"
                  tooltip={false}
                  className="h-4 w-4"
                  onClick={() => publish({ ...draft, tags: draft.tags.filter((item) => item !== tag) })}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-text-subtle">No tags yet.</p>
        )}

        <div className="flex items-center gap-1">
          <Input
            size="sm"
            hideLabel
            label="New tag"
            placeholder="Add tag…"
            leadingIcon={<span aria-hidden="true">#</span>}
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = newTag.replace(/^#/, '').trim();
              if (!value || draft.tags.includes(value)) return;
              publish({ ...draft, tags: [...draft.tags, value] });
              setNewTag('');
            }}
            testId="frontmatter-tag-input"
          />
          <IconButton
            label="Add tag"
            icon={<Plus />}
            disabled={newTag.replace(/^#/, '').trim().length === 0}
            onClick={() => {
              const value = newTag.replace(/^#/, '').trim();
              if (!value || draft.tags.includes(value)) return;
              publish({ ...draft, tags: [...draft.tags, value] });
              setNewTag('');
            }}
            data-testid="frontmatter-add-tag"
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px] text-text-subtle">
        <div>
          <dt className="uppercase tracking-wider">Created</dt>
          <dd className="text-text-muted">{formatDate(note.createdAt)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wider">Updated</dt>
          <dd className="text-text-muted">{formatDate(note.updatedAt, true)}</dd>
        </div>
      </dl>

      <Button
        variant="ghost"
        size="sm"
        fullWidth
        onClick={() => publish(draftFrom(note))}
        testId="frontmatter-reset"
      >
        Reset changes
      </Button>
    </section>
  );
}

export default FrontmatterPanel;