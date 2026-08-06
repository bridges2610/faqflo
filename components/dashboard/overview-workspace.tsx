'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { totalsFor } from '@/lib/dashboard/analytics';
import { formatNumber, timeAgo } from '@/lib/dashboard/format';
import { buildFaqPageSchema, readinessChecks } from '@/lib/dashboard/schema';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';

/*
  The landing screen.

  Its job is to answer "what should I do next?" in one look, so the first thing
  below the stats is a single next action, not a wall of panels. Everything here
  is derived from the same helpers the detail pages use — nothing recomputes a
  number its own way.
*/

type NextAction = { title: string; body: string; href: string; cta: string } | null;

function nextAction(args: {
  hasSite: boolean;
  installed: boolean;
  publishedCount: number;
  draftCount: number;
  unansweredCount: number;
}): NextAction {
  if (!args.hasSite) {
    return {
      title: 'Add your site',
      body: 'Everything else hangs off a site — its FAQs, its snippet, its numbers.',
      href: '/dashboard/setup',
      cta: 'Add a site',
    };
  }
  if (args.publishedCount === 0) {
    return {
      title: 'Publish your first answers',
      body: 'Generate a set from a page on your site, review it, and publish. Nothing reaches an answer engine until something is published.',
      href: '/dashboard/faqs',
      cta: 'Generate FAQs',
    };
  }
  if (!args.installed) {
    return {
      title: 'Install the widget',
      body: 'Your answers are written but they are not on your site yet. It is one line of code, pasted once.',
      href: '/dashboard/setup',
      cta: 'Get the snippet',
    };
  }
  if (args.unansweredCount > 0) {
    return {
      title: `${args.unansweredCount} questions you aren't answering`,
      body: 'People searched your widget for these and found nothing. Each one is a customer telling you what to write next.',
      href: '/dashboard/analytics',
      cta: 'See what they asked',
    };
  }
  if (args.draftCount > 0) {
    return {
      title: `${args.draftCount} ${args.draftCount === 1 ? 'draft is' : 'drafts are'} waiting`,
      body: 'Drafts do nothing until they are published — they are invisible to both visitors and answer engines.',
      href: '/dashboard/faqs',
      cta: 'Review drafts',
    };
  }
  return null;
}

export function OverviewWorkspace() {
  const { site, sites, faqs, analytics, data, resetDemo } = useDashboard();

  if (!site || !data) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your FAQs, your sites, and how they're doing." />
        <EmptyState
          title="Nothing set up yet"
          body="Add a site and FaqFlo has somewhere to put your answers."
          action={<ButtonLink href="/dashboard/setup">Add a site</ButtonLink>}
        />
      </>
    );
  }

  const published = faqs.filter((f) => f.status === 'published');
  const drafts = faqs.length - published.length;
  const daily = analytics?.daily ?? [];
  const week = totalsFor(daily, 7);
  const checks = readinessChecks(site, faqs);
  const failing = checks.filter((c) => c.status === 'fail');
  const schemaCount = buildFaqPageSchema(faqs).mainEntity.length;
  const unansweredCount = analytics?.unanswered.length ?? 0;

  const action = nextAction({
    hasSite: true,
    installed: site.installedAt !== null,
    publishedCount: published.length,
    draftCount: drafts,
    unansweredCount,
  });

  return (
    <>
      <PageHeader
        title={`Hello, ${data.user.name.split(' ')[0]}`}
        description={`${site.name} · ${site.domain}`}
        action={
          <Badge tone={site.installedAt ? 'success' : 'neutral'}>
            {site.installedAt ? `Widget seen ${timeAgo(site.lastSeenAt)}` : 'Widget not installed'}
          </Badge>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Published"
            value={published.length}
            hint={drafts > 0 ? `${drafts} in drafts` : 'nothing waiting'}
          />
          <StatTile label="In your schema" value={schemaCount} hint="questions answer engines see" />
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
            hint="answers actually opened"
          />
        </div>

        {action && (
          <Card className="border-primary p-5 sm:p-7">
            <p className="text-primary font-mono text-xs tracking-wide uppercase">Do this next</p>
            <h2 className="mt-3 text-lg">{action.title}</h2>
            <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{action.body}</p>
            <ButtonLink href={action.href} className="mt-5">
              {action.cta}
            </ButtonLink>
          </Card>
        )}

        {/* items-start: the two cards hold different amounts, and stretching the
            shorter one to match leaves a panel that's mostly empty space. */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">AEO readiness</h2>
              <Badge tone={failing.length === 0 ? 'success' : 'neutral'}>
                {failing.length === 0 ? 'All clear' : `${failing.length} to fix`}
              </Badge>
            </div>
            {failing.length === 0 ? (
              <p className="text-slate mt-3 text-sm leading-relaxed">
                Every check passes — your published answers are structured the way answer engines
                expect.
              </p>
            ) : (
              <ul className="text-slate mt-3 space-y-2 text-sm">
                {failing.map((c) => (
                  <li key={c.id} className="leading-relaxed">
                    <span className="text-navy font-semibold">{c.label}:</span> {c.detail}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/dashboard/aeo"
              className="text-primary hover:text-primary-hover mt-4 inline-block text-sm font-semibold"
            >
              Open AEO →
            </Link>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">Recently updated</h2>
            {faqs.length === 0 ? (
              <p className="text-slate mt-3 text-sm">Nothing yet.</p>
            ) : (
              <ul className="divide-line mt-3 divide-y">
                {[...faqs]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 4)
                  .map((faq) => (
                    <li key={faq.id} className="flex items-start gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="text-navy block truncate text-sm">{faq.question}</span>
                        <span className="text-slate mt-0.5 block text-xs">
                          {timeAgo(faq.updatedAt)}
                        </span>
                      </span>
                      <Badge tone={faq.status === 'published' ? 'success' : 'neutral'}>
                        {faq.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
            <Link
              href="/dashboard/faqs"
              className="text-primary hover:text-primary-hover mt-4 inline-block text-sm font-semibold"
            >
              Manage FAQs →
            </Link>
          </Card>
        </div>

        {/* DEMO ONLY — goes with the rest of the mock layer. */}
        <Card tone="cloud" className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-slate text-sm">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'} on this account. Demo data lives
            in this browser only.
          </p>
          <Button size="sm" variant="ghost" onClick={resetDemo}>
            Reset demo data
          </Button>
        </Card>
      </div>
    </>
  );
}
