'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import { scoreBand } from '@/lib/audit/score';
import { useDashboard } from '@/lib/dashboard/provider';
import { canTrack } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import { auditHistory } from '@/lib/dashboard/store';
import type { AuditRunRow } from '@/lib/supabase/types';
import { buildWorklist, standing } from '@/lib/dashboard/worklist';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { TaskRow } from './task-row';

/*
  The landing screen: a worklist, not a report card.

  What this replaced was four stat tiles, a single hand-picked "do this next"
  card, and a five-row checklist of our own pipeline (Audit → Questions →
  Answers → Publish → Track). Two problems with that. The checklist taught the
  customer our process rather than telling them anything about their site. And
  the single suggestion came from a bespoke if/else cascade that had nothing to
  do with the properly ranked action plan sitting on the Audit page — so the
  answer to "what next?" depended on which screen you were looking at.

  Now there is one ranked list, built by lib/dashboard/worklist.ts from both the
  audit's findings and the state of the account, and it is the first thing on
  the page. Standing comes above it in one line, because "where do I stand" is
  the question that makes the list make sense — not a dashboard of its own.

  Everything below the list is deliberately thin. A front page that shows six
  panels is a front page nobody reads to the bottom of.
*/
export function OverviewWorkspace() {
  const { site, sites, groups, faqs, questions, tracking, data, user } = useDashboard();

  /*
    Past runs, for the "and it moved" line.

    Fetched here rather than in the provider because it is the one piece of
    dashboard data that is not in the local snapshot, only this screen wants it,
    and it must never block the worklist from rendering. A failed or empty read
    simply means no trend line — see auditHistory().
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

  if (!site || !data) {
    return (
      <>
        <PageHeader
          title="Welcome to FaqFlo"
          description="Add your website and we’ll tell you what AI can and can’t see."
        />
        <EmptyState
          title="Nothing set up yet"
          body="Add a site and FaqFlo has something to check, answer for, and keep an eye on. It takes about thirty seconds."
          action={<ButtonLink href="/dashboard/sites">Add your site</ButtonLink>}
        />
      </>
    );
  }

  const report = site.lastAudit;
  const input = { report, site, user, groups, faqs, questions };
  const tasks = buildWorklist(input);
  const state = standing(input);

  const band = report ? scoreBand(report.score) : null;
  const cited = tracking?.latest.filter((c) => c.outcome === 'cited').length ?? 0;
  const checks = tracking?.latest.length ?? 0;

  /*
    The previous comparable run.

    ⚠️ Same depth only. A quick run scores 3 findings across 2 pillars and a
    full run scores ~40 across 6, so "you went from 62 to 41" between the two
    would describe a change in what we measured, not a change to their site.
    `history[0]` is this run, so the comparison starts at index 1.
  */
  const previous = report
    ? history.filter((r) => r.depth === report.depth && r.checked_at !== report.checkedAt)[0]
    : undefined;
  const movement = report && previous ? report.score - previous.score : null;

  return (
    <>
      <PageHeader
        title={`Hello, ${data.user.name.split(' ')[0]}`}
        description={`${site.name} · ${site.domain}`}
      />

      <div className="space-y-5">
        {/* Where you stand, in one strip rather than a wall of tiles. */}
        <Card className="p-5 sm:p-7">
          {report ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
              {/* The `sm` dial existed and had never been used anywhere. This
                  is a supporting fact here, not the headline it is on the
                  audit page, so it gets the smaller one. */}
              <ScoreDial score={report.score} size="sm" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="text-lg">{band!.label}</h2>
                  {/* Movement in words as well as sign — the same reason
                      StatTile writes "Up 12%" rather than a coloured arrow. */}
                  {movement !== null && movement !== 0 && (
                    <Badge tone={movement > 0 ? 'success' : 'neutral'}>
                      {movement > 0 ? 'Up' : 'Down'} {Math.abs(movement)} since last check
                    </Badge>
                  )}
                  <span className="text-slate text-xs">
                    {report.scoredCount} checks · {timeAgo(report.checkedAt)}
                  </span>
                </div>
                <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
                  {band!.summary}
                </p>
                {/* ⚠️ "Are they citing you" is answered honestly or not at all.
                    Nothing queries an engine yet, so a subscriber with no data
                    is told it is not measured — never shown a zero, which would
                    read as "nobody is citing you". */}
                <p className="text-slate mt-2 text-xs">
                  {canTrack(user) && checks > 0
                    ? `Cited in ${cited} of ${checks} checks`
                    : 'Whether AI is citing you: not measured yet'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg">You haven’t been checked yet</h2>
                <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
                  One scan tells you whether an AI crawler can read {site.domain} at all.
                </p>
              </div>
              <ButtonLink href="/dashboard/audit">Check my site</ButtonLink>
            </div>
          )}
        </Card>

        {/* The list. This is the page. */}
        {tasks.length > 0 ? (
          <Card className="border-primary p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg">Do these next</h2>
              <p className="text-slate text-xs">Highest payoff for the least work, in order.</p>
            </div>
            <ul className="divide-line mt-2 divide-y">
              {tasks.map((task, i) => (
                <TaskRow key={task.id} task={task} index={i} />
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">Nothing needs you right now</h2>
            <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
              Your answers are live and current, and the audit found nothing worth fixing. Re-check
              the site after your next round of changes.
            </p>
            <ButtonLink href="/dashboard/audit" variant="ghost" size="sm" className="mt-4">
              Run a fresh check
            </ButtonLink>
          </Card>
        )}

        {/* Three facts, phrased as outcomes. Not our pipeline. */}
        <Card tone="cloud" className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Fact
              value={
                state.totalGroups === 0 ? '—' : `${state.liveGroups} of ${state.totalGroups}`
              }
              label={state.totalGroups === 1 ? 'page live and current' : 'pages live and current'}
              href="/dashboard/publish"
              warn={state.staleGroups > 0 ? `${state.staleGroups} out of date` : null}
            />
            <Fact
              value={state.published}
              label={state.published === 1 ? 'answer published' : 'answers published'}
              href="/dashboard/faqs"
            />
            <Fact
              value={state.unanswered}
              label={state.unanswered === 1 ? 'question unanswered' : 'questions unanswered'}
              href="/dashboard/questions"
            />
          </div>
        </Card>

        {sites.length > 1 && (
          <p className="text-slate text-center text-xs">
            {sites.length} sites on this account — switch at the top of the page.
          </p>
        )}
      </div>
    </>
  );
}

/** One outcome, linked to the screen that changes it. */
function Fact({
  value,
  label,
  href,
  warn,
}: {
  value: string | number;
  label: string;
  href: string;
  warn?: string | null;
}) {
  return (
    <Link href={href} className="group block">
      <p className="font-display text-navy group-hover:text-primary text-[1.5rem] leading-none font-extrabold tabular-nums transition-colors duration-150">
        {value}
      </p>
      <p className="text-slate mt-1.5 text-xs">{label}</p>
      {warn && (
        <span className="mt-1.5 inline-block">
          <Badge tone="neutral">{warn}</Badge>
        </span>
      )}
    </Link>
  );
}
