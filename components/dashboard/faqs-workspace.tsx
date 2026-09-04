'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { publishState } from '@/lib/dashboard/export';
import { useDashboard } from '@/lib/dashboard/provider';
import type { FaqEntry, FaqGroup } from '@/lib/dashboard/types';
import { AnswersGuide, AnswersGuideSummary } from './answers-guide';
import { EmptyState } from './empty-state';
import { GroupForm } from './group-form';
import { PageHeader } from './page-header';
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, PlusIcon, TrashIcon } from './nav-icons';
import { SectionTitle } from './section-title';
import { ANSWER_TABS } from '@/lib/dashboard/answers-tabs';
import { WorkspaceTabs } from './workspace-tabs';

/*
  Answers: the index of pages.

  ⚠️ THIS SCREEN USED TO BE EVERYTHING. Generator, draft review, and every group
  as a collapsible card with its answers nested inside — so the page grew with
  each group added, and finding one answer meant remembering which card it was
  behind. Writing now happens at /dashboard/faqs/[groupId], one page per page,
  and this is the map.

  ⚠️ A "page" here is literally a page of the customer's site, not a topic. The
  export's schema @id is https://{domain}{path}#faq, so the path is not a label —
  it decides where the answers may correctly claim to live. That is why the URL
  is on every row rather than tucked into an edit form, and why there is no
  topic/category concept: one would invite grouping that the export cannot
  honour. Finding things is what the search below is for.
*/

const STATE_BADGE = {
  current: { label: 'Live', tone: 'success' as const },
  stale: { label: 'Out of date', tone: 'cyan' as const },
  never: { label: 'Not pasted', tone: undefined },
  'nothing-to-publish': { label: 'Nothing to paste', tone: undefined },
};

/** What a page contains, in the three states a customer acts on. */
function counts(faqs: FaqEntry[]) {
  const published = faqs.filter((f) => f.status === 'published').length;
  // ⚠️ Blank is its own state, not a kind of draft. A blank draft cannot be
  // published or quoted — the Home worklist already chases them ("Write N
  // answers that are still blank") and this screen never named them.
  const blank = faqs.filter((f) => !f.answer.trim()).length;
  return { published, blank, draft: faqs.length - published, total: faqs.length };
}

export function FaqsWorkspace() {
  const { site, groups, faqs, faqsIn, moveGroup, removeGroup } = useDashboard();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!site) {
    return (
      <>
        <PageHeader title="Answers" description="Everything your customers ask, by page." />
        <EmptyState
          title="Add a site first"
          body="Answers belong to a page of a site, so there's one thing to do before this page is useful."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  /*
    Search across every answer on the site.

    ⚠️ Sorted deliberately: faqsForSite() is the one accessor that does NOT sort
    (its two siblings do), so results would otherwise reshuffle between renders.
    Ordered by page, then by position within it, which is the order they publish
    in and the order the customer already has in their head.
  */
  const needle = query.trim().toLowerCase();
  const results = needle
    ? faqs
        .filter(
          (f) =>
            f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle),
        )
        .map((f) => ({ faq: f, group: groups.find((g) => g.id === f.groupId) ?? null }))
        .filter((r): r is { faq: FaqEntry; group: FaqGroup } => r.group !== null)
        .sort((a, b) => a.group.position - b.group.position || a.faq.position - b.faq.position)
    : [];

  return (
    <>
      <PageHeader
        title="Answers"
        description={`Every page of ${site.name} that has answers on it. Each one gets its own block of code to paste.`}
        action={
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <PlusIcon className="h-4 w-4" />
            New page
          </Button>
        }
      />

      <WorkspaceTabs tabs={ANSWER_TABS} label="Content sections" />

      <div className="space-y-5">
        {adding && (
          <GroupForm siteId={site.id} domain={site.domain} onDone={() => setAdding(false)} />
        )}

        {groups.length === 0 ? (
          /* Nothing else is on this screen, so the whole route through the job
             goes here — not just the one button that starts it. */
          <>
            <AnswersGuide />
            <EmptyState
              title="No pages yet"
              body="A page here is one page of your site — your services page, your pricing page. Add the first one and you can start writing answers for it."
              action={<Button onClick={() => setAdding(true)}>Add a page</Button>}
            />
          </>
        ) : (
          <>
            {/* Collapsed once there are pages: a reminder for the step people
                forget — pasting — without taking the top of the screen from
                someone who already knows. */}
            <AnswersGuideSummary />

            {/* Search first: on a site with a hundred answers, "where is that
                one about deposits" is the question this screen gets asked. */}
            <Card className="p-4">
              <label className="block">
                <span className="sr-only">Search answers</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search every answer on this site…"
                  className="border-line text-navy focus:border-primary placeholder:text-slate/70 w-full rounded-input border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150"
                />
              </label>

              {needle && (
                <div className="mt-3">
                  {results.length === 0 ? (
                    <p className="text-slate text-sm">
                      Nothing matches “{query.trim()}”.
                    </p>
                  ) : (
                    <ul className="divide-line divide-y">
                      {results.map(({ faq, group }) => (
                        <li key={faq.id} className="py-2.5">
                          {/* Straight to the answer, not just its page — the
                              row carries an id for exactly this. */}
                          <Link
                            href={`/dashboard/faqs/${group.id}#${faq.id}`}
                            className="group/hit block"
                          >
                            <p className="text-navy group-hover/hit:text-primary text-sm transition-colors duration-150">
                              {faq.question}
                            </p>
                            <p className="text-slate mt-0.5 text-xs">
                              {group.name}
                              {' · '}
                              {faq.status === 'published'
                                ? 'published'
                                : faq.answer.trim()
                                  ? 'draft'
                                  : 'needs an answer'}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>

            <ul className="space-y-3">
              {groups.map((group, i) => {
                const groupFaqs = faqsIn(group.id);
                const n = counts(groupFaqs);
                const state = STATE_BADGE[publishState(group, groupFaqs)];

                return (
                  <li key={group.id}>
                    <Card className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        {/* The whole title block is the link in. Reorder and
                            delete are siblings, never nested inside it — a
                            control inside a link is recovered from
                            unpredictably by browsers. */}
                        <Link
                          href={`/dashboard/faqs/${group.id}`}
                          className="group/row -m-1 flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-1"
                        >
                          <ChevronIcon className="text-slate group-hover/row:text-navy mt-1.5 h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <SectionTitle>{group.name}</SectionTitle>
                              {state.tone ? (
                                <Badge tone={state.tone}>{state.label}</Badge>
                              ) : (
                                <Badge>{state.label}</Badge>
                              )}
                            </span>
                            <span className="text-slate mt-1 block text-sm">
                              <code className="font-mono text-xs">
                                {group.path ? `${site.domain}${group.path}` : 'No page yet'}
                              </code>
                            </span>
                            <span className="text-slate mt-1 block text-xs">
                              {n.total === 0 ? (
                                'No answers yet'
                              ) : (
                                <>
                                  {n.published} published · {n.draft} draft
                                  {n.blank > 0 && (
                                    <span className="text-error-ink"> · {n.blank} blank</span>
                                  )}
                                </>
                              )}
                            </span>
                          </span>
                        </Link>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => moveGroup(group.id, 'up')}
                            disabled={i === 0}
                            aria-label={`Move ${group.name} up`}
                            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowUpIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveGroup(group.id, 'down')}
                            disabled={i === groups.length - 1}
                            aria-label={`Move ${group.name} down`}
                            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowDownIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirming(group.id)}
                            aria-label={`Delete ${group.name}`}
                            className="text-slate hover:text-error-ink rounded-md p-1.5 transition-colors duration-150"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Two steps, because these rows look alike and the
                          second click is the one that means it. */}
                      {confirming === group.id && (
                        <div className="border-line bg-cloud mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                          <p className="text-slate text-sm">
                            Delete {group.name}
                            {n.total > 0 && <> and its {n.total} answers</>}? This cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirming(null)}
                            >
                              Keep it
                            </Button>
                            <Button
                              size="sm"
                              onClick={async () => {
                                await removeGroup(group.id);
                                setConfirming(null);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
