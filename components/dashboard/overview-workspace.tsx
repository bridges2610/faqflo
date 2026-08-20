'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { scoreBand } from '@/lib/audit/score';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { useDashboard } from '@/lib/dashboard/provider';
import { canTrack } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import { auditHistory } from '@/lib/dashboard/store';
import type { AuditRunRow } from '@/lib/supabase/types';
import { buildWorklist, setupSteps, standing } from '@/lib/dashboard/worklist';
import { DoneForYouCard } from './done-for-you-card';
import { MetricTile } from './metric-tile';
import { AeoIcon, FaqIcon, GlobeIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SetupChecklist } from './setup-checklist';
import { Sparkline } from './sparkline';
import { TaskRow } from './task-row';

/*
  The landing screen.

  This went through a gradient-banner phase and came back out of it. The band
  made a working screen look like the marketing site, and it was covering for
  the real problem underneath: six identical full-width rectangles stacked down
  the page. Density, alignment and real data are what make a tool look finished
  — not the brand's decoration carried across from pages meant to sell.

  So: a row of figures at the top, then a main column holding the one list that
  matters, then a rail of supporting context. Cohesion with the marketing site
  now comes only from shared tokens — same navy, same slate, same radii, same
  type scale.
*/

/**
 * Time-of-day greeting.
 *
 * ⚠️ Reads a client clock, which is normally a hydration bug — see the note in
 * lib/dashboard/format.ts about dates. Safe HERE specifically: AppShell renders
 * its skeleton until the store resolves in an effect, so this never renders
 * during SSR and there is no server output to disagree with. Moving it
 * somewhere that renders on the server would break that.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The dot beside the score band.
 *
 * Thresholds match scoreBand() in lib/audit/score.ts so the colour and the word
 * can never disagree — a "Strong" label next to an amber dot is worse than no
 * dot at all. Cyan is a fill here, which is the only way --color-accent may be
 * used.
 */
function bandDot(score: number): string {
  if (score >= 85) return 'bg-success';
  if (score >= 60) return 'bg-accent';
  return 'bg-error';
}

export function OverviewWorkspace() {
  const { site, sites, groups, faqs, questions, tracking, data, user } = useDashboard();

  /*
    Past runs, for the trend.

    Fetched here rather than in the provider because it is the one piece of
    dashboard data that is not in the local snapshot, only this screen wants it,
    and it must never block the worklist from rendering. A failed or empty read
    simply means no sparkline — see auditHistory().
  */
  const [history, setHistory] = useState<AuditRunRow[]>([]);

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    void auditHistory(site.id).then((rows) => {
      if (!cancelled) setHistory(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [site]);

  const report = site?.lastAudit ?? null;
  const input = { report, site: site ?? null, user, groups, faqs, questions };
  const steps = setupSteps({ ...input, siteCount: sites.length });
  const firstName = data?.user.name.split(' ')[0] ?? '';

  /*
    A brand-new account gets no metric row.

    Four cells reading "—" is worse than no row at all: it fills the top of the
    screen with the shape of information while telling them nothing. The
    checklist is the whole page until there is something to measure.
  */
  if (!site || !data) {
    return (
      <>
        <PageHeader
          title="Welcome to FaqFlo"
          description="Add your website and we’ll read it the way ChatGPT and Perplexity would, then tell you plainly what they can and can’t see."
        />
        <SetupChecklist steps={steps} />
      </>
    );
  }

  const tasks = buildWorklist(input);
  const state = standing(input);
  const band = report ? scoreBand(report.score) : null;
  const cited = tracking?.latest.filter((c) => c.outcome === 'cited').length ?? 0;
  const checks = tracking?.latest.length ?? 0;

  /*
    ⚠️ SAME DEPTH ONLY, and this is where that rule is enforced for both the
    delta and the sparkline.

    A quick run scores 3 findings across 2 pillars; a full run scores ~40 across
    6. Charting them on one line draws a cliff that never happened to the
    customer's site. Sparkline itself can't see `depth`, so it has to be done
    here — reversed at the end because the query returns newest first and a
    trend line reads oldest to newest.
  */
  const comparable = report ? history.filter((r) => r.depth === report.depth) : [];
  const trend = [...comparable].reverse().map((r) => r.score);
  const previous = comparable.find((r) => r.checked_at !== report?.checkedAt);
  const movement = report && previous ? report.score - previous.score : null;

  const pagesWithFaq = report?.pages?.filter((p) => p.hasFaqSchema).length ?? 0;
  const setupDone = steps.every((s) => s.done);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        /* Most people type their domain into the name field, so printing both
           gave "letsroof.com · letsroof.com". */
        description={
          isNamedAfterDomain(site.name, site.domain)
            ? site.domain
            : `${site.name} · ${site.domain}`
        }
        action={
          <ButtonLink href="/dashboard/audit" variant="ghost" size="sm">
            {report ? 'Run a fresh check' : 'Check my site'}
          </ButtonLink>
        }
      />

      {/*
        One card, four cells, hairline dividers — not four floating cards. Four
        shadows across the top of a page read as four separate things competing;
        divided cells read as one row of figures, which is what they are.
      */}
      <Card className="divide-line grid grid-cols-1 divide-y overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
        <MetricTile
          label="Visibility"
          icon={<AeoIcon className="h-3.5 w-3.5" />}
          tint="bg-primary-soft text-primary"
          value={report ? report.score : '—'}
          footer={report ? `${band!.label} · ${timeAgo(report.checkedAt)}` : 'not checked yet'}
          /* Colour beside the band WORD, never instead of it — see the note on
             MetricTile's `status` prop. */
          status={report ? bandDot(report.score) : undefined}
          change={movement !== null ? { amount: movement, unit: 'pts' } : null}
          chart={<Sparkline values={trend} label="Visibility score" />}
          href="/dashboard/audit"
        />
        <MetricTile
          label="Pages live"
          icon={<GlobeIcon className="h-3.5 w-3.5" />}
          tint="bg-accent-soft text-teal-ink"
          value={state.totalGroups === 0 ? '—' : `${state.liveGroups}/${state.totalGroups}`}
          footer={
            state.staleGroups > 0
              ? `${state.staleGroups} out of date`
              : state.totalGroups === 0
                ? 'nothing set up yet'
                : 'up to date'
          }
          href="/dashboard/publish"
        />
        <MetricTile
          label="Answers"
          icon={<FaqIcon className="h-3.5 w-3.5" />}
          tint="bg-success/12 text-success-ink"
          value={state.published}
          footer="published and quotable"
          href="/dashboard/faqs"
        />
        {/* Neutral on purpose. Red would read as an alarm, and zero gaps is a
            good outcome — a tile shouldn't change meaning with its value. */}
        <MetricTile
          label="Gaps"
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          value={state.unanswered}
          footer="questions with no answer"
          href="/dashboard/questions"
        />
      </Card>

      {/* Main column and rail. The rail only exists once there is room beside
          the list; below lg everything stacks in source order, which puts the
          work above the context. */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-5">
          {/* In the MAIN column, not the rail, and only while it is unfinished.
              For a new account this is the primary content — a rail would push
              it below the worklist on a phone, which is exactly the person who
              needs it first. */}
          {!setupDone && <SetupChecklist steps={steps} />}

          {tasks.length > 0 ? (
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[0.9375rem] font-bold tracking-normal">Do these next</h2>
                <p className="text-slate text-xs">Highest payoff for the least work, in order.</p>
              </div>
              <ul className="divide-line mt-2 divide-y">
                {tasks.map((task, i) => (
                  <TaskRow key={task.id} task={task} index={i} />
                ))}
              </ul>
            </Card>
          ) : (
            report && (
              <Card className="p-5 sm:p-7">
                <h2 className="text-[0.9375rem] font-bold tracking-normal">Nothing needs you right now</h2>
                <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
                  Your answers are live and current, and the last check found nothing worth
                  fixing. Come back after your next round of changes to the site.
                </p>
              </Card>
            )
          )}
        </div>

        <div className="mt-5 space-y-5 lg:mt-0">
          {report && (
            <Card className="p-5">
              <h2 className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
                About this site
              </h2>
              <dl className="divide-line mt-3 divide-y text-sm">
                <Row
                  term="Pages read"
                  value={`${report.crawled.length} of ${Math.max(report.discovered, report.crawled.length)}`}
                />
                <Row
                  term="With FAQ markup"
                  value={report.pages ? `${pagesWithFaq} of ${report.pages.length}` : '—'}
                />
                {/* "Not set", not "unknown": on a site that has never run a
                    full audit we did not look and fail — there was nothing to
                    look at. "Unknown" implied a dead end, which is what this
                    row used to be. */}
                <Row term="Industry" value={site.industry ?? 'Not set'} />
                <Row term="Service area" value={site.location ?? 'Not set'} />
                <Row
                  term="AI citations"
                  /* ⚠️ Honestly or not at all. Without a run behind it a zero
                     would read as "nobody is citing you", which we would not have
                     measured. `checks > 0` is what makes this a count rather than
                     an assumption. */
                  value={
                    canTrack(site, user) && checks > 0 ? `${cited} of ${checks}` : 'not measured'
                  }
                />
              </dl>

              {/* ⚠️ Where these two values came from changes how much to trust
                  them, so the UI says which it is — `schema` is the business's
                  own markup, `inferred` is a model's reading of the homepage.

                  Every state except `manual` links out, including the null one.
                  That was the bug: the link used to appear only for `inferred`,
                  so a site that had never had a content plan built showed
                  "unknown" with nowhere to go — and the editor it pointed at
                  was itself unreachable until a plan existed.

                  It now points at Sites, which holds the only editor. Keeping
                  one editor is what keeps the `manual` promise — once a
                  customer corrects us, no later run overwrites it — in one
                  place rather than several. */}
              {site.profileSource !== 'manual' && (
                <p className="text-slate mt-3 text-xs leading-relaxed">
                  {site.profileSource === 'inferred'
                    ? 'Industry and area were worked out from your homepage. '
                    : site.profileSource === 'schema'
                      ? "Read from your site's own markup. "
                      : 'Not set yet — adding them makes your content plan and questions specific to your trade. '}
                  <Link
                    href="/dashboard/sites"
                    className="text-primary hover:text-primary-hover font-semibold"
                  >
                    {site.profileSource === null ? 'Add them →' : 'Edit →'}
                  </Link>
                </p>
              )}
            </Card>
          )}

          <Card tone="cloud" className="p-5">
            <h2 className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Learn
            </h2>
            <ul className="mt-3 space-y-3.5">
              <LearnLink
                href="/blog/what-is-aeo"
                title="What AEO is, in plain English"
                body="Why being the answer replaced being ranked."
              />
              <LearnLink
                href="/seo-guide"
                title="SEO in the age of AI answers"
                body="The fundamentals that still matter, and why."
              />
            </ul>
            <p className="text-slate border-line mt-4 border-t pt-3 text-xs leading-relaxed">
              Citation tracking — putting your questions to the engines and recording who they
              name — runs on a schedule: five checks across your Get Cited window, and weekly on
              Stay Cited. You can see them on the Results page.
            </p>
          </Card>

          {/*
            Below Learn, at the bottom of the rail.

            Last on purpose: the rail is supporting context, and this is the
            only thing in it asking for money. Above the Learn card it would be
            the second thing on the screen after the worklist, which is a
            harder sell than the page has earned by then.

            `tone="white"` because Learn directly above is cloud — two cloud
            cards in a row merge into one block. `compact` because the rail is
            20rem and the card's default padding is a viewport breakpoint that
            would resolve to p-7 in here. Copy is shorter than the default for
            the same reason: this column is a third the width of the Publish
            page the default wording was written for.
          */}
          <DoneForYouCard
            tone="white"
            compact
            body="I’ll set the whole thing up by hand and get it live on your site."
          />
        </div>
      </div>

      {sites.length > 1 && (
        <p className="text-slate mt-6 text-center text-xs">
          {sites.length} sites on this account — switch at the top of the page.
        </p>
      )}
    </>
  );
}

/** One term and its value in the site brief. */
function Row({ term, value }: { term: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-slate">{term}</dt>
      <dd className="text-navy min-w-0 truncate text-right font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** A way into the guides — the only thing in the dashboard that links to them. */
function LearnLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <li>
      <Link href={href} className="group block">
        <p className="text-navy group-hover:text-primary text-sm font-semibold transition-colors duration-150">
          {title} →
        </p>
        <p className="text-slate mt-0.5 text-xs leading-relaxed">{body}</p>
      </Link>
    </li>
  );
}
