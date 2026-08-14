'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { buildPasteBlock, publishState } from '@/lib/dashboard/export';
import { canPublish } from '@/lib/dashboard/plans';
import { FaqCapReached } from '@/lib/dashboard/store';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { FaqEntry, FaqGroup } from '@/lib/dashboard/types';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronIcon,
  CopyIcon,
  LockIcon,
  PlusIcon,
  TickIcon,
  TrashIcon,
} from './nav-icons';
import { FaqRow } from './faq-row';
import { GroupForm } from './group-form';
import { SectionTitle } from './section-title';

type Filter = 'all' | 'published' | 'draft';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
];

const STATE_BADGE = {
  current: { tone: 'success', label: 'Live copy current' },
  stale: { tone: 'neutral', label: 'Live copy out of date' },
  never: { tone: 'neutral', label: 'Not pasted yet' },
  'nothing-to-publish': { tone: 'neutral', label: 'Nothing published' },
} as const;

/** Blank row for writing one by hand — not everything comes from the model. */
function ManualForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const { addFaqs } = useDashboard();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addFaqs(groupId, [{ question, answer, status: 'draft', source: 'manual' }]);
    } catch (err) {
      // Keep what they typed on screen — this one was written by hand, and
      // clearing the form on a cap error would throw away their work.
      setError(
        err instanceof FaqCapReached
          ? `This site can hold ${err.cap} answers on the free tier. Get Cited removes the limit.`
          : 'That answer could not be saved. Please try again.',
      );
      setSaving(false);
      return;
    }
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
      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Copy this group's answer HTML without leaving the page — or opening the group.
 *
 * ⚠️ ENTITLEMENT: the export is most of what Get Cited sells, and Publish is
 * gated on it. A copy button here that handed over the same HTML would be a
 * hole straight through that gate, so this one checks the same capability and
 * turns into a link to Publish — where the existing UpgradeCard already
 * explains the tier — when the site hasn't got it.
 */
function CopyHtmlButton({ group, faqs }: { group: FaqGroup; faqs: FaqEntry[] }) {
  const { site } = useDashboard();
  const { copied, copy } = useCopy();

  // The same block Publish hands over, schema included. Copying only the HTML
  // here would make this the one route to a half-paste that still lets the
  // group be marked published.
  const html = site ? buildPasteBlock(site, group, faqs) : '';
  const allowed = canPublish(site);

  if (!allowed) {
    return (
      <Link
        href="/dashboard/publish"
        aria-label={`Copying the code for ${group.name} needs Get Cited`}
        title="Get Cited unlocks the export for this site"
        className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150"
      >
        <LockIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      onClick={() => copy(html)}
      disabled={!html}
      aria-label={
        !html
          ? `Nothing published in ${group.name} to copy`
          : copied
            ? `Code for ${group.name} copied`
            : `Copy the code for ${group.name}`
      }
      title={!html ? 'Publish an answer first' : 'Copy the answers and schema'}
      className={`rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
        copied ? 'text-success-ink' : 'text-slate hover:text-primary hover:bg-cloud'
      }`}
    >
      {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
    </button>
  );
}

/**
 * One group: the answers for one page, and everything you can do to them.
 *
 * The page it belongs to is in the header rather than buried in settings —
 * it's the thing that makes a group a group, and it's what the customer needs
 * to know before deciding whether an answer belongs here.
 */
export function GroupCard({
  group,
  domain,
  isFirst,
  isLast,
  defaultOpen = false,
  forceOpen = false,
}: {
  group: FaqGroup;
  domain: string;
  isFirst: boolean;
  isLast: boolean;
  /** Open on first render — true when this is the only group. */
  defaultOpen?: boolean;
  /** Something just happened to this group (created, or answers saved into
      it), so it opens itself. Landing on a collapsed card right after adding
      four answers reads as the save having failed. */
  forceOpen?: boolean;
}) {
  const { faqsIn, moveGroup, removeGroup } = useDashboard();
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const bodyId = `grp-body-${group.id}`;

  const faqs = faqsIn(group.id);
  const publishedCount = faqs.filter((f) => f.status === 'published').length;
  const draftCount = faqs.length - publishedCount;
  const shown = filter === 'all' ? faqs : faqs.filter((f) => f.status === filter);
  const state = STATE_BADGE[publishState(group, faqs)];

  if (editing) {
    return (
      <Card className="p-5 sm:p-7">
        <GroupForm
          siteId={group.siteId}
          domain={domain}
          group={group}
          onDone={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* The toggle is the title block only. The reorder and delete controls
            below are siblings, not children: a <button> inside a <button> is
            invalid HTML and browsers recover from it unpredictably. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group/toggle -m-1 flex min-w-0 items-start gap-2.5 rounded-lg p-1 text-left"
        >
          <ChevronIcon
            className={`text-slate group-hover/toggle:text-navy mt-1.5 h-4 w-4 shrink-0 transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <SectionTitle>{group.name}</SectionTitle>
              <Badge tone={state.tone}>{state.label}</Badge>
            </span>
            <span className="text-slate mt-1 block text-sm">
              <code className="font-mono text-xs">
                {domain}
                {group.path}
              </code>{' '}
              · {publishedCount} published · {draftCount} draft
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <CopyHtmlButton group={group} faqs={faqs} />

          <button
            onClick={() => moveGroup(group.id, 'up')}
            disabled={isFirst}
            aria-label={`Move ${group.name} up`}
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => moveGroup(group.id, 'down')}
            disabled={isLast}
            aria-label={`Move ${group.name} down`}
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${group.name}`}
            className="text-slate hover:text-error-ink rounded-md p-1.5 transition-colors duration-150"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="border-line bg-cloud mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-slate text-sm">
            Delete <span className="text-navy font-semibold">{group.name}</span> and its{' '}
            {faqs.length} {faqs.length === 1 ? 'answer' : 'answers'}?
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => removeGroup(group.id)}
              className="text-error-ink text-sm font-semibold"
            >
              Delete
            </button>
            <button onClick={() => setConfirming(false)} className="text-slate text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Everything below the header is the disclosure body. It's unmounted
          rather than hidden, so a collapsed group's answers aren't sitting in
          the DOM for a crawler, a find-in-page or a screen reader to trip over. */}
      {!open ? null : (
      <div id={bodyId}>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="h-4 w-4" />
          Write one
        </Button>
        <button
          onClick={() => setEditing(true)}
          className="text-slate hover:text-navy text-sm transition-colors duration-150"
        >
          Rename or change page
        </button>
        <Link
          href={`/dashboard/publish#${group.id}`}
          className="text-primary hover:text-primary-hover text-sm font-semibold transition-colors duration-150"
        >
          Get the code →
        </Link>
      </div>

      {adding && <ManualForm groupId={group.id} onDone={() => setAdding(false)} />}

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
        <p className="text-slate mt-5 text-sm">
          Nothing here yet. Generate a set into this group, or write the first one.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-slate mt-5 text-sm">
          Nothing {filter === 'draft' ? 'in drafts' : 'published'} in this group.
        </p>
      ) : (
        <ul className="divide-line mt-2 divide-y">
          {shown.map((faq) => (
            <FaqRow
              key={faq.id}
              faq={faq}
              // Judged against the group's full list, not the filtered view:
              // moving an item while a filter is on still moves it past its real
              // neighbour, so the arrows have to reflect the real ends.
              isFirst={faq.position === 0}
              isLast={faq.position === faqs.length - 1}
            />
          ))}
        </ul>
      )}
      </div>
      )}
    </Card>
  );
}
