'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { DuplicatePath } from '@/lib/dashboard/store';
import { normalizePath } from '@/lib/dashboard/export';
import type { FaqGroup } from '@/lib/dashboard/types';

/*
  Create or rename a group.

  Two fields, because a group is two things: what the customer calls it, and
  which page it gets pasted on. The path is shown back normalised as they type —
  paste a full URL and it keeps only the path, since a group belongs to a site
  that already owns the domain.
*/
export function GroupForm({
  siteId,
  domain,
  group,
  onDone,
}: {
  siteId: string;
  domain: string;
  /** Present when editing rather than creating. */
  group?: FaqGroup;
  /**
   * Receives the new page's id when one was created, and whether an existing
   * page was MOVED — a move clears its published state, and the caller is the
   * one with room to say so.
   */
  onDone: (createdId?: string, moved?: boolean) => void;
}) {
  const { addGroup, editGroup, groups } = useDashboard();
  const [name, setName] = useState(group?.name ?? '');
  const [path, setPath] = useState(group?.path ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cleaned = normalizePath(path);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Give the page a name.');

    /*
      Checked here for a message while they type, and again in the store, which
      is the real gate — see DuplicatePath. Two pages on one path would produce
      two blocks for the same URL, each claiming the same schema @id.
    */
    const clash = groups.some((g) => g.path === cleaned && g.id !== group?.id);
    if (clash) return setError(`Another page already covers ${cleaned}.`);

    // Moving a page clears its published state, because nothing has been
    // pasted at the new address. Said before it happens, not discovered after.
    const moving = Boolean(group && cleaned !== group.path && group.publishedAt);

    setSaving(true);
    let createdId: string | undefined;
    try {
      if (group) {
        await editGroup(group.id, { name, path: cleaned });
      } else {
        createdId = await addGroup(siteId, { name, path: cleaned });
      }
    } catch (err) {
      setSaving(false);
      return setError(
        err instanceof DuplicatePath
          ? `Another page already covers ${err.path}.`
          : 'That could not be saved. Please try again.',
      );
    }
    setSaving(false);
    onDone(createdId, moving);
  }

  return (
    <form onSubmit={submit} className="border-line bg-cloud rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Page name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Services"
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>

        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Page it goes on
          </span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/services"
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>
      </div>

      <p className="text-slate mt-2 text-xs">
        Will be published at{' '}
        <code className="text-navy font-mono">
          {domain}
          {cleaned}
        </code>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : group ? 'Save page' : 'Add page'}
        </Button>
        {/* Wrapped rather than passed directly: onDone takes an optional id,
            and React would hand it a MouseEvent. */}
        <Button size="sm" variant="ghost" type="button" onClick={() => onDone()}>
          Cancel
        </Button>
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
