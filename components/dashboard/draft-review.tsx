'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import type { Faq } from '@/lib/faq';
import { SectionTitle } from './section-title';

/*
  Review step between generating and saving.

  Nothing reaches the site until someone has read it. Every candidate starts
  selected — the model's output is usually good, so the common path is "keep
  them all" — but each one can be dropped, and the whole set can be saved as
  drafts or published outright.
*/
export function DraftReview({
  candidates,
  destination,
  onSave,
  onDiscard,
  saving = false,
}: {
  candidates: Faq[];
  /** Group these will be saved into — named so it can't be a surprise. */
  destination: string;
  onSave: (kept: Faq[], status: 'draft' | 'published') => void;
  onDiscard: () => void;
  saving?: boolean;
}) {
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const kept = candidates.filter((_, i) => !dropped.has(i));

  function toggle(index: number) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <Card className="border-primary p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Review before saving</SectionTitle>
          <p className="text-slate mt-1 text-sm">
            {kept.length} of {candidates.length} selected, going into{' '}
            <span className="text-navy font-semibold">{destination}</span>. Untick anything you
            don&rsquo;t want.
          </p>
        </div>
        <Badge tone="success">New</Badge>
      </div>

      <ul className="divide-line mt-5 divide-y">
        {candidates.map((faq, i) => {
          const isKept = !dropped.has(i);
          return (
            <li key={`${i}-${faq.q}`} className="py-3.5">
              <label className="flex cursor-pointer gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
                    isKept ? 'bg-primary border-primary text-white' : 'border-line bg-white'
                  }`}
                >
                  {isKept && <Check className="h-3 w-3" />}
                </span>
                <input
                  type="checkbox"
                  checked={isKept}
                  onChange={() => toggle(i)}
                  className="sr-only"
                />
                <span className={isKept ? '' : 'opacity-50'}>
                  <span className="text-navy block text-[0.9375rem] font-semibold">{faq.q}</span>
                  <span className="text-slate mt-1 block text-sm leading-relaxed">{faq.a}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => onSave(kept, 'published')} disabled={saving || kept.length === 0}>
          {saving ? 'Saving…' : `Publish ${kept.length}`}
        </Button>
        <Button
          variant="ghost"
          onClick={() => onSave(kept, 'draft')}
          disabled={saving || kept.length === 0}
        >
          Save as drafts
        </Button>
        <button
          onClick={onDiscard}
          disabled={saving}
          className="text-slate hover:text-navy text-sm transition-colors duration-150"
        >
          Discard
        </button>
      </div>
    </Card>
  );
}
