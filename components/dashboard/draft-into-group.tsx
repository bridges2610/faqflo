'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { FaqCapReached } from '@/lib/dashboard/store';

/*
  "Draft an answer" from anywhere that surfaces a question — Discover, Tracking.

  A drafted answer has to land in a group, and the group decides which page it
  gets pasted onto. With one group there's no decision to make; with several,
  the customer picks. Choosing silently on their behalf is how an answer ends up
  on the wrong page, which is the exact failure groups exist to prevent.

  The answer itself is left empty on purpose: a placeholder that reached the
  export would be worse than no answer at all. This is a prompt for a human,
  not a shortcut past one.
*/
export function DraftIntoGroup({
  question,
  onDrafted,
}: {
  question: string;
  /** Called after the draft is created, e.g. to mark a question covered. */
  onDrafted?: () => Promise<void> | void;
}) {
  const { groups, addFaqs } = useDashboard();
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft(groupId: string) {
    setBusy(true);
    setError(null);
    try {
      await addFaqs(groupId, [{ question, answer: '', status: 'draft', source: 'discovered' }]);
    } catch (err) {
      // The free keep-limit. This control sits in a table row, so the message
      // has to be short — the full explanation lives on the Answers screen.
      setError(
        err instanceof FaqCapReached ? `Free tier holds ${err.cap} answers` : 'Could not draft',
      );
      setBusy(false);
      return;
    }
    await onDrafted?.();
    setBusy(false);
    setDone(true);
  }

  if (done) return <Badge tone="success">Drafted</Badge>;
  if (groups.length === 0) return null;

  if (error) {
    return (
      <span role="alert" className="text-error-ink text-xs">
        {error}
      </span>
    );
  }

  if (groups.length === 1) {
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => draft(groups[0].id)}>
        {busy ? 'Drafting…' : 'Draft an answer'}
      </Button>
    );
  }

  if (!picking) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
        Draft an answer
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`draft-${question}`}>
        Which group should this answer go in?
      </label>
      <select
        id={`draft-${question}`}
        defaultValue=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) draft(e.target.value);
        }}
        className="border-line text-navy focus:border-primary rounded-input border bg-white px-2 py-1 text-sm outline-none"
      >
        <option value="" disabled>
          Into which page?
        </option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {g.path}
          </option>
        ))}
      </select>
      <button onClick={() => setPicking(false)} className="text-slate text-sm">
        Cancel
      </button>
    </span>
  );
}
