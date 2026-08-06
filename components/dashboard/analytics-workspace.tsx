'use client';

import { ButtonLink } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { hasFullAnalytics } from '@/lib/dashboard/plans';
import { lifetimeTotals, totalsFor } from '@/lib/dashboard/analytics';
import { formatNumber } from '@/lib/dashboard/format';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { TopQuestions } from './top-questions';
import { TrafficChart } from './traffic-chart';
import { UnansweredReport } from './unanswered-report';
import { UpgradeCard } from './upgrade-card';

export function AnalyticsWorkspace() {
  const { site, analytics, plan } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Analytics" description="What your answers are doing out there." />
        <EmptyState
          title="Add a site first"
          body="Traffic is measured per site, so there's nothing to chart until one exists."
          action={<ButtonLink href="/dashboard/setup">Go to setup</ButtonLink>}
        />
      </>
    );
  }

  const daily = analytics?.daily ?? [];

  if (daily.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" description={`Widget traffic for ${site.name}.`} />
        <EmptyState
          title="No traffic yet"
          body={
            site.installedAt
              ? 'The widget is installed but hasn’t been seen by a visitor yet. Numbers appear here within a day of the first pageview.'
              : 'Nothing is being measured until the snippet is on your site.'
          }
          action={<ButtonLink href="/dashboard/setup">Get the snippet</ButtonLink>}
        />
      </>
    );
  }

  const week = totalsFor(daily, 7);
  const lifetime = lifetimeTotals(daily);
  const fullAnalytics = hasFullAnalytics(plan);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Widget traffic for ${site.name}. An expand means someone opened an answer — the number worth watching.`}
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Views · 7 days"
            value={formatNumber(week.views)}
            delta={week.viewsDelta}
            hint="vs the week before"
          />
          <StatTile
            label="Expands · 7 days"
            value={formatNumber(week.expands)}
            delta={week.expandsDelta}
            hint="vs the week before"
          />
          <StatTile
            label="Open rate"
            value={`${week.expandRate.toFixed(0)}%`}
            hint="of views opened an answer"
          />
          <StatTile
            label={`Views · ${daily.length} days`}
            value={formatNumber(lifetime.views)}
            hint={`${formatNumber(lifetime.expands)} expands`}
          />
        </div>

        <TrafficChart daily={daily} />

        {/* Per-question breakdown is the Business line on the pricing page
            ("Full analytics"); Pro gets the totals and the trend above. */}
        {fullAnalytics ? (
          <TopQuestions questions={analytics?.questions ?? []} />
        ) : (
          <UpgradeCard
            title="Per-question breakdown"
            body="See which individual answers get opened, which get skipped, and how that changes week to week — not just the totals for the whole widget."
          />
        )}

        <UnansweredReport unanswered={analytics?.unanswered ?? []} siteId={site.id} />
      </div>
    </>
  );
}
