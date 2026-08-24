'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { discoverQuestions } from '@/lib/dashboard/discover';
import { useDashboard } from '@/lib/dashboard/provider';
import { canDiscover, FREE_QUESTION_SAMPLE, questionCapFor } from '@/lib/dashboard/plans';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';
import { OPPORTUNITY_TABS, WorkspaceTabs } from './workspace-tabs';
import { MicroLabel } from './micro-label';
import { SectionTitle } from './section-title';

/*
  Opportunities: the questions people put to assistants about this business, and
  whether the site answers them.

  This screen shipped a long time before anything filled it. The empty state
  said "check back shortly after setup" while nothing existed to do the
  checking — store.addQuestions() had no caller, and the only questions that
  ever appeared came from the dev seed. It now has a button, and the button
  calls a real model.

  ⚠️ NO ASK-VOLUME FIGURE. Every row used to read "About 480 asks a month". That
  number was fixture data; nothing in this product measures ask volume and no
  model can know it. What each row carries instead is the reason answering it
  would help THIS business, which is a judgment the model can actually make.
*/

/** Intent shown as a word, so the list can be scanned by the kind of ask. */
const INTENT_LABEL: Record<string, string> = {
  pricing: 'Cost',
  service: 'What you do',
  trust: 'Trust',
  logistics: 'Timing & area',
  problem: 'Problem',
};

export function DiscoverWorkspace() {
  const { site, user, questions, faqs, coverQuestion, addQuestions, recheckCoverage } =
    useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!site) {
    return (
      <>
        <PageHeader title="Opportunities" description="What people ask AI about your category." />
        <EmptyState
          title="Add a site first"
          body="Questions are found per site, from what that site does and where it works."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  /*
    ⚠️ THIS PAGE USED TO BE A PAYWALL FOR FREE ACCOUNTS, AND THAT CONTRADICTED
    WHAT WE SELL. It returned an UpgradeCard instead of the list, so a free
    account saw zero questions — while the pricing page promises "a sample of 5
    questions people ask AI about businesses like yours". The sample existed the
    whole time: the onboarding scan stores all 15 (see runQuestionsStage), and
    nothing rendered them.

    What is actually gated is RE-RUNNING discovery, which costs an Opus call and
    is refused server-side at /api/dashboard/questions. Showing rows the account
    already paid for with its one free scan costs nothing.
  */
  const canFindMore = canDiscover(user);

  const pages = site.lastAudit?.pages ?? [];

  /*
    The free sample. A display cap, not a security boundary — the rows are the
    customer's own and readable under RLS from their browser. It exists so the
    upgrade has something concrete to reveal, and so upgrading reveals it
    instantly with no second model call.
  */
  const cap = questionCapFor(user);
  const visible = Number.isFinite(cap) ? questions.slice(0, cap) : questions;
  const hidden = questions.length - visible.length;

  const uncovered = visible.filter((q) => !q.covered);

  async function discover() {
    if (!site) return;
    setError(null);
    setBusy(true);

    try {
      // No `exclude`: this button deliberately REPLACES the list, so the model
      // is free to propose a better-worded version of a question already here.
      // The Results page passes the current set instead — see discoverQuestions.
      const result = await discoverQuestions({ site, faqs });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await addQuestions(site.id, result.questions);
      await recheckCoverage(site.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        description={`Questions people put to AI about a business like ${site.name}. The ones you don't answer are the ones a competitor gets quoted for.`}
        action={
          canFindMore && questions.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={discover} disabled={busy}>
              {busy ? 'Looking…' : 'Find more'}
            </Button>
          ) : null
        }
      />

      <WorkspaceTabs tabs={OPPORTUNITY_TABS} label="Opportunities sections" />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-5">
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}

        {/* A full check has to have run: without the crawl there is nothing to
            tell the model what this business does, and nothing to tell it which
            questions the site already covers. */}
        {pages.length === 0 ? (
          <EmptyState
            title="Check your site first"
            body="We read your own pages to work out what you do and what you already answer. Run a full check and this fills itself in."
            action={<ButtonLink href="/dashboard/audit">Check my site</ButtonLink>}
          />
        ) : questions.length === 0 ? (
          <EmptyState
            title="Find out what people are asking"
            body="We read your site, work out your trade and your area, and come back with the questions real people put to assistants about businesses like yours — skipping anything you already answer."
            action={
              canFindMore ? (
                <Button onClick={discover} disabled={busy}>
                  {busy ? 'Looking…' : 'Find questions'}
                </Button>
              ) : (
                <ButtonLink href="/dashboard/plan">See Pro</ButtonLink>
              )
            }
          />
        ) : (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <SectionTitle>Questions to answer</SectionTitle>
                <Badge tone="neutral">
                  {visible.length - uncovered.length} of {visible.length} answered
                </Badge>
              </div>
            </div>

            <ul className="divide-line mt-3 divide-y">
              {visible.map((q) => (
                <li key={q.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className="text-navy text-[0.9375rem] font-medium">{q.question}</p>
                      {q.intent && INTENT_LABEL[q.intent] && (
                        <Badge tone="neutral">{INTENT_LABEL[q.intent]}</Badge>
                      )}
                    </div>
                    {/* Why it is worth answering — in place of the invented
                        monthly-ask figure this row used to carry. */}
                    {q.why && <p className="text-slate mt-1 text-sm leading-relaxed">{q.why}</p>}
                  </div>
                  {q.covered ? (
                    <Badge tone="success">Answered</Badge>
                  ) : (
                    <DraftIntoGroup question={q.question} onDrafted={() => coverQuestion(q.id)} />
                  )}
                </li>
              ))}
            </ul>

            {/* ⚠️ The held-back count is stated, not hidden. A sample the
                customer cannot tell is a sample reads as "this is all there
                is" — which undersells both the scan and the upgrade. */}
            {hidden > 0 && (
              <p className="text-slate border-line mt-4 border-t pt-4 text-sm leading-relaxed">
                We found <strong className="text-navy">{hidden} more</strong> that your free check
                doesn&rsquo;t show. Pro reveals them straight away — no waiting, nothing to re-run.
              </p>
            )}
          </Card>
        )}

        {!canFindMore && questions.length > 0 && (
          <UpgradeCard
            title={`See all ${questions.length} questions, not just ${FREE_QUESTION_SAMPLE}`}
            body="Your free check already found them — Pro unlocks the rest, keeps looking for new ones as your trade changes, and turns any of them into an answer you can publish."
          />
        )}

        </div>

        {/* The rail: what drafting one of these actually leads to. */}
        {uncovered.length > 0 && (
          <div className="mt-5 lg:mt-0">
          <Card tone="cloud" className="p-5">
            <MicroLabel>Where this goes</MicroLabel>
            <SectionTitle as="h3" className="mt-3">
              {uncovered.length} {uncovered.length === 1 ? 'question has' : 'questions have'} no
              answer on your site
            </SectionTitle>
            <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
              Drafting one puts it in your answers as a blank, waiting for you to write it in your
              own words. Publish it, paste the export onto your page, and it becomes something an
              assistant can quote.
            </p>
            <ButtonLink href="/dashboard/faqs" size="sm" className="mt-4">
              Go to Answers
            </ButtonLink>
          </Card>
          </div>
        )}
      </div>
    </>
  );
}
