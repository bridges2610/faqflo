'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { EmptyState } from './empty-state';
import { FaqRow } from './faq-row';
import { FaqIcon, PlusIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { PublishPanel } from './publish-panel';
import { SectionTitle } from './section-title';

/*
  One page: the questions customers ask, and your answer under each.

  ⚠️ THIS ABSORBED THREE ROUTES AND THAT IS THE POINT. Answers, Publish and
  Opportunities were three destinations for one job — find a question nobody has
  answered, answer it, put it on your website. Splitting them meant the gap and
  the place you close it were never on screen together, and the copy block lived
  a click away from the thing being copied.

  ⚠️ THE PAGE STRUCTURE IS NOT THE DATA STRUCTURE, AND ONE GROUP IS WHY. Every
  function in lib/dashboard/export.ts takes a single FaqGroup — the block, its
  schema, its URL, its published hash. A flat list therefore needs one group per
  site. Sites created before this have several, one per website page, and
  mergeGroupsForSite() collapses them.

  ⚠️ THE MERGE IS OFFERED, NOT PERFORMED ON ARRIVAL. It is idempotent and
  loses no answers, but it does change what belongs where: a customer who
  pasted one block on /services and another on /pricing ends up with a single
  block and two live pages holding partial copies. That is a consequence for
  their website, not just their data, so it is a button with the consequence
  written next to it rather than something that happens while the page loads.
*/
export function AnswersWorkspace() {
  const { site, groups, faqs, questions, addGroup, addFaqs, coverQuestion, mergeGroups } =
    useDashboard();
  const [merging, setMerging] = useState(false);
  const [draftQ, setDraftQ] = useState('');
  const [draftA, setDraftA] = useState('');
  const [adding, setAdding] = useState(false);

  if (!site) {
    return (
      <>
        <PageHeader title="Answers" description="The questions customers ask, and your answers." />
        <EmptyState
          title="Add a site first"
          body="Answers belong to a site, so we know which website to put them on."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  const group = groups[0] ?? null;

  /*
    ⚠️ EVERY ANSWER ON THE SITE, NOT JUST THE FIRST GROUP'S.

    This filtered to `group.id`, which on a site with several pages showed one
    page's answers and silently hid the rest — indistinguishable from having
    lost them, on the screen whose whole job is to show you what you have
    written. `faqs` from the provider is already faqsForSite, so the fix is to
    stop narrowing it.

    Ordered by page and then by position, which is the order the merge would
    put them in, so joining the list rearranges nothing the reader can see.
  */
  const order = new Map(groups.map((g, i) => [g.id, i]));
  const mine = [...faqs].sort(
    (a, b) =>
      (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0) || a.position - b.position,
  );
  const ready = mine.filter((f) => f.status === 'published').length;

  /* Questions nobody has answered. This is what Opportunities was, moved to sit
     directly above the place you answer them. */
  const suggestions = questions.filter((q) => !q.covered);

  return (
    <>
      <PageHeader
        className="mb-4"
        title="Answers"
        description={`What customers ask about ${site.name}, and what you tell them.`}
      />

      {groups.length > 1 ? (
        <Card tone="cloud" className="mb-5 p-5">
          <SectionTitle>Put your answers in one list</SectionTitle>
          <p className="text-slate mt-1 text-sm leading-relaxed">
            Your answers are split across {groups.length} pages. Joining them makes one list and
            one block to copy. Nothing is deleted.
          </p>
          {/* ⚠️ THE CONSEQUENCE IS STATED BEFORE THE BUTTON, NOT AFTER IT. The
              pages already carrying a block keep the old copy until this one is
              pasted, and that is the part a customer would not guess. */}
          <p className="text-slate mt-2 text-sm leading-relaxed">
            You’ll need to paste the new block onto your site afterwards. Until you do, your pages
            keep the copy you pasted before.
          </p>
          <Button
            size="sm"
            className="mt-4"
            disabled={merging}
            onClick={async () => {
              setMerging(true);
              await mergeGroups(site.id);
              setMerging(false);
            }}
          >
            {merging ? 'Joining…' : 'Join them into one list'}
          </Button>
        </Card>
      ) : null}

      {suggestions.length > 0 ? (
        <Card className="mb-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle icon={<SearchIcon className="h-4 w-4" />} tint="bg-accent-soft text-teal-ink">
              Questions you haven’t answered
            </SectionTitle>
            <Badge tone="cyan">{suggestions.length}</Badge>
          </div>
          <p className="text-slate mt-1 text-sm">
            Customers ask AI these. You don’t answer them yet.
          </p>

          <ul className="divide-line mt-3 divide-y">
            {suggestions.slice(0, 8).map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="text-navy min-w-0 flex-1 text-sm">{q.question}</p>
                {/* ⚠️ IT FILLS THE COMPOSER BELOW RATHER THAN LINKING ANYWHERE.
                    An href to #new was a link to a list, which left the reader
                    to retype the question they had just clicked. The gap and
                    the filling being on one screen is the whole reason these
                    two lists were merged; carrying the text across is what
                    makes that worth anything. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setDraftQ(q.question);
                    setAdding(true);
                    document.getElementById('composer')?.scrollIntoView({ block: 'center' });
                  }}
                >
                  Answer it
                </Button>
              </li>
            ))}
          </ul>

          {suggestions.length > 8 ? (
            <p className="text-slate mt-3 text-xs">
              and {suggestions.length - 8} more.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<FaqIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
            Your answers
          </SectionTitle>
          <Badge tone={ready > 0 ? 'success' : undefined}>{mine.length}</Badge>
        </div>
        <p className="text-slate mt-1 text-sm">
          Drag to reorder. This is the order they appear on your website.
        </p>

        {group === null ? (
          <div className="mt-4">
            <p className="text-slate text-sm">
              Nothing here yet. Start a list and write your first answer.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => addGroup(site.id, { name: 'Answers', path: '/faq' })}
            >
              Start my answers
            </Button>
          </div>
        ) : mine.length === 0 ? (
          <p className="text-slate mt-4 text-sm">
            No answers yet. Pick a question above, or add your own.
          </p>
        ) : (
          <ul id="new" className="divide-line mt-2 divide-y">
            {mine.map((faq, i) => (
              <FaqRow key={faq.id} faq={faq} isFirst={i === 0} isLast={i === mine.length - 1} />
            ))}
          </ul>
        )}
        {group ? (
          <div id="composer" className="border-line mt-4 scroll-mt-24 border-t pt-4">
            {adding ? (
              <div className="space-y-2">
                <label className="block">
                  <span className="sr-only">The question</span>
                  <input
                    value={draftQ}
                    onChange={(e) => setDraftQ(e.target.value)}
                    placeholder="How much does a new roof cost?"
                    className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-[0.9375rem] font-semibold outline-none transition-colors duration-150"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Your answer</span>
                  <textarea
                    value={draftA}
                    onChange={(e) => setDraftA(e.target.value)}
                    rows={4}
                    placeholder="Answer it the way you would on the phone. Plain and specific."
                    className="border-line bg-cloud text-navy focus:border-primary w-full resize-y rounded-input border px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!draftQ.trim() || !draftA.trim()}
                    onClick={async () => {
                      /* ⚠️ status: 'published' — the word means "in the block",
                         not "live on their website". Only published entries
                         reach the export, so a draft here would be written,
                         saved, and silently absent from the thing they copy. */
                      await addFaqs(group.id, [
                        {
                          question: draftQ.trim(),
                          answer: draftA.trim(),
                          status: 'published',
                          source: 'manual',
                        },
                      ]);
                      /* Mark the suggestion answered, so it leaves the list
                         above rather than sitting there beside its own answer. */
                      const match = questions.find((x) => x.question === draftQ.trim());
                      if (match) await coverQuestion(match.id);
                      setDraftQ('');
                      setDraftA('');
                      setAdding(false);
                    }}
                  >
                    Save answer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftQ('');
                      setDraftA('');
                      setAdding(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <PlusIcon className="mr-1.5 h-3.5 w-3.5" /> Add a question
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      {/* ⚠️ THE BAR IS THE LAST STEP, PINNED WHERE THE LAST STEP BELONGS. An
          answer written and never pasted does nothing at all — it is the one
          action on this page that changes what AI can read — so it does not
          scroll away with the list. */}
      {/* ⚠️ THE PANEL GETS ONE GROUP'S ANSWERS, NOT THE WHOLE SITE'S. Every
          export function keys on a single group, so handing it `mine` on a
          multi-page site would build a block claiming answers that belong to a
          different page — and stamp its hash against the wrong content. Until
          the merge runs, the bar exports the first page; the card above says
          why joining them is worth doing. */}
      {group && ready > 0 ? (
        <PublishPanel
          site={site}
          group={group}
          faqs={mine.filter((f) => f.groupId === group.id)}
        />
      ) : null}
    </>
  );
}
