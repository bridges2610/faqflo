'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/*
  Industry and service area, editable.

  Extracted from content-workspace.tsx, where it was a private function and
  therefore only ever rendered below that page's `if (!contentPlan) return`.
  That meant the only editor for these two fields in the whole product was
  behind a content plan — a customer who had never built one had no way to
  correct us, and the dashboard's "Industry: unknown" row led nowhere.

  ⚠️ Whoever saves from here owns the `profileSource` they write with. Sites
  writes 'manual', because a person typed it, and that value is what stops a
  later audit or content plan from overwriting them — see the guards in
  audit-workspace.tsx and content-workspace.tsx. Passing anything else from a
  hand-edit would quietly break that promise.
*/
export function BusinessProfile({
  industry,
  location,
  source,
  onSave,
  className = '',
  defaultEditing = false,
  onDone,
}: {
  industry: string | null;
  location: string | null;
  /** Where the current values came from. Only 'inferred' shows a badge. */
  source: string | null;
  onSave: (industry: string, location: string) => Promise<void>;
  /** Margin belongs to the caller — Content wants space below, a row doesn't. */
  className?: string;
  /** Open straight into the form, for a caller whose own button revealed this. */
  defaultEditing?: boolean;
  /** After save or cancel, so a caller can collapse the panel it opened. */
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(defaultEditing);
  const [nextIndustry, setNextIndustry] = useState(industry ?? '');
  const [nextLocation, setNextLocation] = useState(location ?? '');
  const [saving, setSaving] = useState(false);

  const field =
    'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150';

  function close() {
    setEditing(false);
    onDone?.();
  }

  if (editing) {
    return (
      <Card tone="cloud" className={`p-5 ${className}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Industry
            </span>
            <input
              className={field}
              value={nextIndustry}
              onChange={(e) => setNextIndustry(e.target.value)}
              placeholder="Roofing contractor"
            />
          </label>
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Service area
            </span>
            <input
              className={field}
              value={nextLocation}
              onChange={(e) => setNextLocation(e.target.value)}
              placeholder="Franklin, TN"
            />
          </label>
        </div>

        {/* What these two fields are actually for. Without it the form reads as
            account admin, and there's no reason to bother filling it in. */}
        <p className="text-slate mt-3 text-xs leading-relaxed">
          Used to write your content plan and to find the questions people ask about your trade.
          The more specific, the better the suggestions.
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(nextIndustry, nextLocation);
              setSaving(false);
              close();
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={close}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      <p className="text-slate text-sm">
        <span className="text-navy font-semibold">{industry || 'Industry not set'}</span>
        {location ? <> · {location}</> : null}
      </p>
      {source === 'inferred' && <Badge tone="neutral">Worked out from your site — check it</Badge>}
      <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}
