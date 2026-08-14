'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canDiscover } from '@/lib/dashboard/plans';
import type { GeneratedQuestion } from '@/lib/questions';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';
import { OPPORTUNITY_TABS, WorkspaceTabs } from './workspace-tabs';

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

  if (!canDiscover(site, user)) {
    return (
      <>
        <PageHeader title="Opportunities" description="What people ask AI about your category." />
        <WorkspaceTabs tabs={OPPORTUNITY_TABS} label="Opportunities sections" />
        <UpgradeCard
          entitlement="get_cited"
          siteName={site.name}
          title="The questions people actually ask"
          body="Real questions put to AI assistants about your trade and your area — read off your own site, so they are ones you could genuinely answer. Each one becomes an answer you can publish."
        />
      </>
    );
  }

  const pages = site.lastAudit?.pages ?? [];
  const uncovered = questions.filter((q) => !q.covered);

  async function discover() {
    if (!site) return;
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/dashboard/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          industry: site.industry,
          location: site.location,
          hint: site.lastAudit?.profileHint ?? '',
          pages,
          // Sent so the model doesn't propose things already answered — the
          // fastest way to look like we never read their site.
          answered: faqs
            .filter((f) => f.status === 'published' && f.answer.trim())
            .map((f) => f.question),
        }),
      });

      const payload = (await res.json()) as { questions?: GeneratedQuestion[]; error?: string };
      if (!res.ok || !payload.questions) {
        setError(payload.error ?? 'Could not find questions. Please try again.');
        return;
      }

      await addQuestions(site.id, payload.questions);
      await recheckCoverage(site.id);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
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
          questions.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={discover} disabled={busy}>
              {busy ? 'Looking…' : 'Find more'}
            </Button>
          ) : null
        }
      />

      <WorkspaceTabs tabs={OPPORTUNITY_TABS} label="Opportunities sections" />

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
              <Button onClick={discover} disabled={busy}>
                {busy ? 'Looking…' : 'Find questions'}
              </Button>
            }
          />
        ) : (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg">Questions to answer</h2>
                <Badge tone="neutral">
                  {questions.length - uncovered.length} of {questions.length} answered
                </Badge>
              </div>
            </div>

            <ul className="divide-line mt-3 divide-y">
              {questions.map((q) => (
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
          </Card>
        )}

        {uncovered.length > 0 && (
          <Card tone="cloud" className="p-5 sm:p-7">
            <p className="text-slate font-mono text-xs tracking-wide uppercase">Where this goes</p>
            <h3 className="mt-3 text-lg">
              {uncovered.length} {uncovered.length === 1 ? 'question has' : 'questions have'} no
              answer on your site
            </h3>
            <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
              Drafting one puts it in your answers as a blank, waiting for you to write it in your
              own words. Publish it, paste the export onto your page, and it becomes something an
              assistant can quote.
            </p>
            <ButtonLink href="/dashboard/faqs" size="sm" className="mt-4">
              Go to Answers
            </ButtonLink>
          </Card>
        )}
      </div>
    </>
  );
}
