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
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { UpgradeCard } from './upgrade-card';

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
        <PageHeader title="Results" description={`What the engines say about ${site.domain}.`} />
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

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Cited" value={cited} hint={`of ${latest.length} checks`} />
          <StatTile label="Named, not linked" value={mentioned} hint="mentioned without a source" />
          <StatTile label="Citation rate" value={`${citationRate.toFixed(0)}%`} hint="of checks" />
          <StatTile label="Not in the answer" value={absent} hint="someone else was" />
        </div>

        <CitationChart daily={daily} />

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">Who gets cited</h2>
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
                    <div className="bg-cloud mt-1.5 h-2 overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${c.isYou ? 'bg-primary' : 'bg-line'}`}
                        style={{ width: `${Math.max(2, (c.citations / top) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">Not cited for</h2>
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
        </div>

        {/* The budget, in the unit that's actually bought.

            Prompts lead; engine checks are the cost of them and sit underneath.
            "300 checks" tells a solo marketer nothing about how many questions
            they can watch — they'd have to divide by engines and frequency
            themselves. Note there is no page count anywhere near this: pages
            are scanned, prompts are asked, and the two never derive from each
            other. */}
        {tracking && (
          <Card tone="cloud" className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
              <div className="bg-line h-2 w-40 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${Math.min(100, usedPct)}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        <p className="text-slate text-center text-xs">
          Engines checked: {ENGINES.join(' · ')}
        </p>
      </div>
    </>
  );
}
