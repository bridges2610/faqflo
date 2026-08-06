'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
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
  /** Receives the new group's id when one was created, so the caller can open it. */
  onDone: (createdId?: string) => void;
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

    if (!name.trim()) return setError('Give the group a name.');

    // Two groups on one path would produce two blocks for the same page, each
    // claiming the same schema @id.
    const clash = groups.some((g) => g.path === cleaned && g.id !== group?.id);
    if (clash) return setError(`Another group already covers ${cleaned}.`);

    setSaving(true);
    let createdId: string | undefined;
    if (group) {
      await editGroup(group.id, { name, path: cleaned });
    } else {
      createdId = await addGroup(siteId, { name, path: cleaned });
    }
    setSaving(false);
    onDone(createdId);
  }

  return (
    <form onSubmit={submit} className="border-line bg-cloud rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Group name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Service page"
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
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
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
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
          {saving ? 'Saving…' : group ? 'Save group' : 'Add group'}
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
