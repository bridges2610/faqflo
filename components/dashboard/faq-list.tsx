'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import type { FaqEntry } from '@/lib/dashboard/types';
import { EmptyState } from './empty-state';
import { FaqRow } from './faq-row';
import { PlusIcon } from './nav-icons';

type Filter = 'all' | 'published' | 'draft';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
];

/** Blank row for writing one by hand — not everything comes from the model. */
function ManualForm({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const { addFaqs } = useDashboard();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    await addFaqs(siteId, [
      { question, answer, status: 'draft', source: 'manual' },
    ]);
    setSaving(false);
    onDone();
  }

  return (
    <div className="border-line bg-cloud mt-4 rounded-xl border p-4">
      <label className="block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Question
        </span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Do you offer weekend appointments?"
          className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-[0.9375rem] outline-none transition-colors duration-150"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Answer
        </span>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Two or three sentences, in plain words."
          className="border-line text-navy focus:border-primary mt-1.5 w-full resize-y rounded-input border bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !question.trim() || !answer.trim()}>
          {saving ? 'Adding…' : 'Add as draft'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function FaqList({ siteId, faqs }: { siteId: string; faqs: FaqEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

  const publishedCount = faqs.filter((f) => f.status === 'published').length;
  const draftCount = faqs.length - publishedCount;
  const shown = filter === 'all' ? faqs : faqs.filter((f) => f.status === filter);

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg">Your FAQs</h2>
          <Badge tone="neutral">
            {publishedCount} published · {draftCount} draft
          </Badge>
        </div>

        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="h-4 w-4" />
          Write one
        </Button>
      </div>

      {adding && <ManualForm siteId={siteId} onDone={() => setAdding(false)} />}

      {faqs.length > 0 && (
        <div
          className="bg-cloud border-line mt-5 inline-flex items-center gap-1 rounded-full border p-1"
          role="group"
          aria-label="Filter"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full px-3.5 py-1 text-sm transition-all duration-200 ${
                filter === f.id
                  ? 'text-navy shadow-soft bg-white font-semibold'
                  : 'text-slate hover:text-navy'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {faqs.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No FAQs yet"
            body="Generate a set from a description or a page on your site, or write the first one yourself."
          />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-slate mt-6 text-sm">
          Nothing {filter === 'draft' ? 'in drafts' : 'published'} yet.
        </p>
      ) : (
        <ul className="divide-line mt-2 divide-y">
          {shown.map((faq) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              // Position is judged against the full list, not the filtered one:
              // moving an item while a filter is on still moves it past its real
              // neighbour, so the arrows have to reflect the real ends.
              isFirst={faq.position === 0}
              isLast={faq.position === faqs.length - 1}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
