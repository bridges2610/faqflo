'use client';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canTrack, engineChecksFor } from '@/lib/dashboard/plans';
import { formatNumber, timeAgo, timeUntil } from '@/lib/dashboard/format';
import { ENGINES } from '@/lib/dashboard/types';
import { CitationChart } from './citation-chart';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { MetricTile } from './metric-tile';
import { Meter } from './meter';
import { AeoIcon, ChartIcon, GlobeIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';
import { SectionTitle } from './section-title';

/*
  Tracking — the differentiator, and the reason the subscription exists.

  Two things are load-bearing here:

  1. Every number is a count of checks we actually ran. Nothing is modelled,
     extrapolated or smoothed. "Cited 4 times" has to mean four answers we saw.
  2. The query cap is shown, not hidden. Each check costs money, so the plan
     buys a finite number of them — a customer who runs out should find out from
     the UI, not from results quietly going stale.
*/
export function TrackingWorkspace() {
  const { site, user, tracking, questions, coverQuestion } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Tracking" description="Whether AI is actually citing you." />
        <EmptyState
          title="Add a site first"
          body="Citations are tracked per site, against that site's domain."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  if (!canTrack(user)) {
    return (
      <>
        <PageHeader title="Tracking" description="Whether AI is actually citing you." />
        <UpgradeCard
          entitlement="stay_cited"
          title="Stay Cited"
          body="Keeps every site on your account generating once its 30 days are up — new audits and unlimited answers. Citation tracking, which asks the engines your questions and records who they name, is what we are building next; it is not running yet."
        />
      </>
    );
  }

  const daily = tracking?.daily ?? [];
  const latest = tracking?.latest ?? [];

  /*
    ⚠️ Nothing produces this data yet.

    There is no code in this repo that queries ChatGPT, Perplexity or Google AI
    Overviews — no API route, no scheduler, no write path. `emptyTracking()`
    returns zeros and the only thing that has ever filled `daily` is the
    dev-only demo fixture.

    So this state says so. It used to read "the first round runs within a day of
    your answers going live", which is a schedule nobody set. A subscriber
    waiting on a run that will never happen is a refund; telling them plainly is
    the cheaper and more honest outcome.
  */
  if (daily.length === 0) {
    return (
      <>
        <PageHeader title="Results" description={`What the engines say about ${site.name}.`} />
        <EmptyState
          title="Citation tracking isn’t running yet"
          body="This is the part we’re building next: asking ChatGPT, Perplexity and Google AI Overviews your questions on a schedule and recording who they name. Your subscription is keeping every site on your account generating in the meantime, and you’ll be told the moment tracking goes live."
          action={<ButtonLink href="/dashboard/faqs">Work on your answers</ButtonLink>}
        />
      </>
    );
  }

  const cited = latest.filter((c) => c.outcome === 'cited').length;
  const mentioned = latest.filter((c) => c.outcome === 'mentioned').length;
  const absent = latest.filter((c) => c.outcome === 'absent').length;
  const citationRate = latest.length ? (cited / latest.length) * 100 : 0;

  const uncited = latest.filter((c) => c.outcome === 'absent');
  // The bar tracks prompts — the thing bought — not the checks they cost.
  const usedPct = tracking ? (tracking.promptsTracked / tracking.promptCap) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Tracking"
        description={`What ChatGPT, Perplexity and Google AI Overviews say when asked about ${site.name}.`}
      />

      {/* One card, four cells, hairline dividers — the same row the dashboard
          home uses. Four separate cards read as four competing things. */}
      <Card className="divide-line grid grid-cols-1 divide-y overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
        <MetricTile
          label="Cited"
          icon={<ChartIcon className="h-3.5 w-3.5" />}
          tint="bg-success/12 text-success-ink"
          value={cited}
          footer={`of ${latest.length} checks`}
        />
        <MetricTile
          label="Named, not linked"
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          tint="bg-accent-soft text-teal-ink"
          value={mentioned}
          footer="mentioned without a source"
        />
        <MetricTile
          label="Citation rate"
          icon={<AeoIcon className="h-3.5 w-3.5" />}
          tint="bg-primary-soft text-primary"
          value={`${citationRate.toFixed(0)}%`}
          footer="of checks"
        />
        <MetricTile
          label="Not in the answer"
          icon={<GlobeIcon className="h-3.5 w-3.5" />}
          value={absent}
          footer="someone else was"
        />
      </Card>

      {/* Main column and rail. The chart and the share-of-voice are the
          content; the uncited list and the budget are what you act on. */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-5">
          <CitationChart daily={daily} />

          <Card className="p-5 sm:p-7">
            <SectionTitle>Who gets cited</SectionTitle>
            <p className="text-slate mt-1 text-sm">
              Across every check we ran for {site.name}&rsquo;s questions.
            </p>

            <ul className="mt-5 space-y-4">
              {(tracking?.competitors ?? []).map((c) => {
                const top = Math.max(...(tracking?.competitors ?? []).map((x) => x.citations), 1);
                return (
                  <li key={c.domain}>
                    <div className="flex items-baseline justify-between gap-4">
                      <p
                        className={`min-w-0 truncate text-sm ${
                          c.isYou ? 'text-navy font-semibold' : 'text-slate'
                        }`}
                      >
                        {c.domain}
                        {c.isYou && ' (you)'}
                      </p>
                      <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                        {c.citations}
                      </p>
                    </div>
                    <Meter
                      className="mt-1.5"
                      value={(c.citations / top) * 100}
                      tone={c.isYou ? 'primary' : 'line'}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="mt-5 space-y-5 lg:mt-0">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Not cited for</SectionTitle>
              <Badge tone="cyan">{uncited.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              Questions where an engine named someone else. This is the loop closing — each one is
              the next answer to write.
            </p>

            {uncited.length === 0 ? (
              <p className="text-slate mt-4 text-sm">
                You were cited or named on every question we checked.
              </p>
            ) : (
              <ul className="divide-line mt-3 divide-y">
                {uncited.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-navy text-sm">{c.question}</p>
                      <p className="text-slate mt-0.5 text-xs">
                        {c.engine} cited{' '}
                        <span className="font-mono">{c.citedInstead ?? 'nobody'}</span> ·{' '}
                        {timeAgo(c.checkedAt)}
                      </p>
                    </div>
                    <DraftIntoGroup
                      question={c.question}
                      onDrafted={async () => {
                        const match = questions.find((q) => q.question === c.question);
                        if (match) await coverQuestion(match.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

        {/* The budget, in the unit that's actually bought.

            Prompts lead; engine checks are the cost of them and sit underneath.
            "300 checks" tells a solo marketer nothing about how many questions
            they can watch — they'd have to divide by engines and frequency
            themselves. Note there is no page count anywhere near this: pages
            are scanned, prompts are asked, and the two never derive from each
            other. */}
        {tracking && (
          <Card tone="cloud" className="p-5">
            <div className="min-w-0">
              <div className="min-w-0">
                <p className="text-navy text-sm font-semibold">
                  {formatNumber(tracking.promptsTracked)} of {formatNumber(tracking.promptCap)}{' '}
                  prompts tracked
                </p>
                <p className="text-slate mt-0.5 text-xs">
                  {formatNumber(tracking.checksUsed)} of{' '}
                  {formatNumber(
                    engineChecksFor(tracking.promptCap, ENGINES.length, tracking.runsPerPeriod),
                  )}{' '}
                  engine checks this period · each prompt is asked {ENGINES.length} engines ×{' '}
                  {tracking.runsPerPeriod} times · resets {timeUntil(tracking.periodResetsAt)}
                </p>
              </div>
              <Meter className="mt-3" value={usedPct} />
            </div>
          </Card>
        )}
        </div>
      </div>

      <p className="text-slate mt-6 text-center text-xs">
        Engines checked: {ENGINES.join(' · ')}
      </p>
    </>
  );
}
