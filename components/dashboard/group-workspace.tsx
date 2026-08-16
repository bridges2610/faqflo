'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { publishState } from '@/lib/dashboard/export';
import { useDashboard } from '@/lib/dashboard/provider';
import { FaqCapReached } from '@/lib/dashboard/store';
import type { Faq } from '@/lib/faq';
import { DraftReview } from './draft-review';
import { EmptyState } from './empty-state';
import { FaqRow } from './faq-row';
import { GeneratorPanel, type GenerationMeta } from './generator-panel';
import { CopyHtmlButton } from './copy-html-button';
import { GroupForm } from './group-form';
import { ManualForm } from './manual-form';
import { PageHeader } from './page-header';
import { PlusIcon } from './nav-icons';
import { ANSWER_TABS, WorkspaceTabs } from './workspace-tabs';

/*
  One page of the customer's site: its answers, and the tools that make them.

  ⚠️ THE ROUTE IS THE DESTINATION. This used to be a card in a list, with the
  generator elsewhere on the same screen and a select deciding which group its
  output landed in. generator-panel.tsx already argued that "where it lands is
  chosen before generating, not after", and the old Answers screen called
  picking it afterwards "how answers end up on the wrong page" — being on this
  route IS that decision, so the select is gone rather than defaulted.

  ⚠️ Which page an answer publishes to is not cosmetic: the export's schema @id
  is https://{domain}{path}#faq, so an answer in the wrong group claims to live
  at a URL it is not on.
*/

type Filter = 'all' | 'published' | 'draft' | 'blank';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  // ⚠️ Blank is not a kind of draft, it is the thing standing between a draft
  // and being useful — a blank answer cannot be published or quoted. The Home
  // worklist has always counted these; this is the first screen to filter them.
  { id: 'blank', label: 'Needs an answer' },
];

const STATE_BADGE = {
  current: { tone: 'success' as const, label: 'Live copy current' },
  stale: { tone: 'cyan' as const, label: 'Live copy out of date' },
  never: { tone: undefined, label: 'Not pasted yet' },
  'nothing-to-publish': { tone: undefined, label: 'Nothing published' },
};

export function GroupWorkspace({ groupId }: { groupId: string }) {
  const { site, groups, faqsIn, addFaqs } = useDashboard();

  const [candidates, setCandidates] = useState<Faq[] | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [movedNotice, setMovedNotice] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const group = groups.find((g) => g.id === groupId) ?? null;

  /*
    A missing group is a normal state here, not an error: the id comes from the
    URL, and deleting a page or switching sites leaves a link pointing at
    nothing. Say so and offer the way back rather than rendering a blank shell.
  */
  if (!site || !group) {
    return (
      <>
        <PageHeader title="Answers" description="Everything your customers ask, by page." />
        <WorkspaceTabs tabs={ANSWER_TABS} activeHref="/dashboard/faqs" label="Answers sections" />
        <EmptyState
          title="That page isn’t here"
          body="It may have been deleted, or it belongs to a different site than the one selected."
          action={<ButtonLink href="/dashboard/faqs">Back to answers</ButtonLink>}
        />
      </>
    );
  }

  const faqs = faqsIn(group.id);
  const state = STATE_BADGE[publishState(group, faqs)];
  const blanks = faqs.filter((f) => !f.answer.trim()).length;

  const shown =
    filter === 'all'
      ? faqs
      : filter === 'blank'
        ? faqs.filter((f) => !f.answer.trim())
        : faqs.filter((f) => f.status === filter);

  async function save(kept: Faq[], status: 'draft' | 'published') {
    setSaving(true);
    setCapError(null);

    try {
      await addFaqs(
        group!.id,
        kept.map((f) => ({
          question: f.q,
          answer: f.a,
          status,
          source: 'generated' as const,
          tone: meta?.tone,
          language: meta?.language,
        })),
      );
    } catch (err) {
      /* The free tier's keep-limit. Caught rather than left to reject: the
         candidates are still on screen and still worth keeping, so the customer
         needs to be told which ones didn't fit rather than watching a save
         silently do nothing. */
      setCapError(
        err instanceof FaqCapReached
          ? `${site!.name} can hold ${err.cap} answers on the free tier, and saving these would go over. Get Cited removes the limit — everything already written stays.`
          : 'Those answers could not be saved. Please try again.',
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setCandidates(null);
    setMeta(null);
  }

  return (
    <>
      <PageHeader
        title={group.name}
        description={`Answers published to ${site.domain}${group.path}`}
        action={
          <ButtonLink href="/dashboard/faqs" variant="ghost" size="sm">
            All pages
          </ButtonLink>
        }
      />

      {/* Exact-match tabs can't recognise a nested route, so the override says
          which one owns it. Without this neither tab highlights. */}
      <WorkspaceTabs tabs={ANSWER_TABS} activeHref="/dashboard/faqs" label="Answers sections" />

      <div className="space-y-5">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {state.tone ? <Badge tone={state.tone}>{state.label}</Badge> : <Badge>{state.label}</Badge>}
              <code className="text-slate font-mono text-xs">
                {site.domain}
                {group.path}
              </code>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setEditing((v) => !v)}
                className="text-slate hover:text-navy text-sm transition-colors duration-150"
              >
                Rename or change page
              </button>
              <CopyHtmlButton group={group} faqs={faqs} />
              <Link
                href={`/dashboard/publish#${group.id}`}
                className="text-primary hover:text-primary-hover text-sm font-semibold transition-colors duration-150"
              >
                Get the code →
              </Link>
            </div>
          </div>

          {editing && (
            <div className="mt-4">
              <GroupForm
                siteId={group.siteId}
                domain={site.domain}
                group={group}
                onDone={(_created, moved) => {
                  setEditing(false);
                  if (moved) setMovedNotice(true);
                }}
              />
            </div>
          )}

          {/* Moving a page clears its published state, because nothing has been
              pasted at the new address. Silently flipping the badge back to
              "not pasted" would look like a bug. */}
          {movedNotice && (
            <p className="text-slate mt-3 text-sm">
              This page now points somewhere new, so it counts as not yet pasted — the block needs
              pasting at the new address.
            </p>
          )}
        </Card>

        {capError && (
          <div role="alert" className="border-line bg-cloud rounded-xl border p-4">
            <p className="text-navy text-sm font-semibold">Not enough room to save these</p>
            <p className="text-slate mt-1 text-sm leading-relaxed">{capError}</p>
          </div>
        )}

        {/* No destination picker: this route is the destination. */}
        <GeneratorPanel
          disabled={saving}
          groups={groups}
          targetGroupId={group.id}
          onGenerated={(generated, generationMeta) => {
            setCandidates(generated);
            setMeta(generationMeta);
          }}
        />

        {candidates && (
          <DraftReview
            candidates={candidates}
            destination={group.name}
            saving={saving}
            onSave={save}
            onDiscard={() => {
              setCandidates(null);
              setMeta(null);
            }}
          />
        )}

        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-navy text-sm font-semibold">
              {faqs.length} {faqs.length === 1 ? 'answer' : 'answers'}
              {blanks > 0 && <span className="text-error-ink"> · {blanks} still blank</span>}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
              <PlusIcon className="h-4 w-4" />
              Write one
            </Button>
          </div>

          {adding && (
            <div className="mt-4">
              <ManualForm groupId={group.id} onDone={() => setAdding(false)} />
            </div>
          )}

          {faqs.length > 0 && (
            <div
              className="bg-cloud border-line mt-4 inline-flex items-center gap-1 rounded-full border p-1"
              role="group"
              aria-label="Filter answers"
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
              Nothing here yet. Generate a set above, or write the first one by hand.
            </p>
          ) : shown.length === 0 ? (
            <p className="text-slate mt-5 text-sm">
              {filter === 'blank'
                ? 'Every answer here has been written.'
                : `Nothing ${filter === 'draft' ? 'in drafts' : 'published'} on this page.`}
            </p>
          ) : (
            <ul className="divide-line mt-2 divide-y">
              {shown.map((faq) => (
                <FaqRow
                  key={faq.id}
                  faq={faq}
                  // Judged against the page's full list, not the filtered view:
                  // moving an item while a filter is on still moves it past its
                  // real neighbour, so the arrows have to reflect the real ends.
                  isFirst={faq.position === 0}
                  isLast={faq.position === faqs.length - 1}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
