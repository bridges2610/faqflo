'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { matchMustHave } from '@/lib/content';
import type { PageContent } from '@/lib/audit/types';
import { useDashboard } from '@/lib/dashboard/provider';
import { Check } from '@/components/ui/check';
import { OutcomeBar, type OutcomeSplit } from './engine-detail';
import { ChartIcon, DocIcon } from './nav-icons';
import { SectionTitle } from './section-title';

/*
  The two things the audit could not say on its own.

  The report answers "can AI read my website". These answer "is it working" and
  "what should a business like mine be doing" — both from data that already
  exists elsewhere in the dashboard, neither computed a second time here.

  ⚠️ THEY LIVE IN THEIR OWN FILE BECAUSE audit-summary.tsx IS THE PRINTABLE ONE.
  That component carries .print-report and a set of print: overrides, and it is
  long. Adding two more sections inline would have made the thing hardest to
  reason about — what does and does not reach paper — harder still.
*/

/**
 * Whether AI actually names them, in one row.
 *
 * ⚠️ THE SAME DATA AI MENTIONS READS, COUNTED THE SAME WAY. cited + mentioned +
 * absent is every check by construction — CitationCheck['outcome'] is exactly
 * those three — so this cannot disagree with that page. It is a window, not a
 * second opinion.
 *
 * ⚠️ NO CHECKS IS NOT A SCORE OF ZERO. An account that has never run a check
 * gets a sentence saying so. Drawing an empty bar would report a measurement of
 * nothing as a measurement of failure.
 */
/** One pass over the checks. Shared, so two surfaces cannot count differently. */
function splitOf(latest: { outcome: 'cited' | 'mentioned' | 'absent' }[]): OutcomeSplit[] {
  return [
    { outcome: 'cited', count: latest.filter((c) => c.outcome === 'cited').length },
    { outcome: 'mentioned', count: latest.filter((c) => c.outcome === 'mentioned').length },
    { outcome: 'absent', count: latest.filter((c) => c.outcome === 'absent').length },
  ];
}

export function VisibilityStrip() {
  const { tracking } = useDashboard();
  const latest = tracking?.latest ?? [];
  const split = splitOf(latest);

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<ChartIcon className="h-4 w-4" />} tint="bg-accent-soft text-teal-ink">
          Are AI tools naming you?
        </SectionTitle>
        {/* print:hidden on the link alone: the heading and the numbers are worth
            printing, a link nobody can click is not. */}
        <Link
          href="/dashboard/tracking"
          className="text-primary hover:text-primary-hover shrink-0 text-sm font-semibold print:hidden"
        >
          See AI Mentions →
        </Link>
      </div>

      {latest.length > 0 ? (
        <>
          <p className="text-navy mt-3 text-sm font-semibold">
            Of the {latest.length} {latest.length === 1 ? 'answer' : 'answers'} we checked
          </p>
          <OutcomeBar splits={split} total={latest.length} className="mt-2.5" />
        </>
      ) : (
        <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
          We haven’t put your questions to the AI tools yet. That is the other half of getting
          found, and it is where you will see whether any of this worked.
        </p>
      )}
    </Card>
  );
}

/**
 * The same reading as VisibilityStrip, without the card around it.
 *
 * ⚠️ IT SHARES THE COUNTING, NOT A COPY OF IT. Both call splitOf(), so the
 * number on the audit and the number on AI Mentions cannot drift apart. That
 * was the whole reason the strip existed; the walkthrough just needed it
 * without the heading and the border.
 */
export function VisibilityLine() {
  const { tracking } = useDashboard();
  const latest = tracking?.latest ?? [];

  if (latest.length === 0) {
    return (
      <p className="text-slate text-[0.9375rem] leading-relaxed">
        Not yet. We haven’t put your questions to the AI tools. That’s the other half of getting
        found.
      </p>
    );
  }

  const split = splitOf(latest);
  const named = (split[0]?.count ?? 0) + (split[1]?.count ?? 0);

  return (
    <>
      <p className="text-navy text-[0.9375rem] leading-relaxed">
        {named > 0
          ? `Sometimes. You were named in ${named} of ${latest.length} answers.`
          : `Not yet. None of the ${latest.length} answers named you.`}
      </p>
      <OutcomeBar splits={split} total={latest.length} className="mt-3" />
      <BestEngine />
    </>
  );
}

/**
 * Which assistant names them most often.
 *
 * ⚠️ RANKED ON A RATE, NOT A COUNT, AND THE DENOMINATOR IS PER ENGINE. An
 * engine that 429s mid-run has fewer checks against it — EngineBreakdown.checked
 * says so and warns it is "never assumed equal" — so comparing raw totals would
 * crown whichever engine happened to answer most often that week.
 *
 * ⚠️ SILENT ON A TIE OR A SHUTOUT. If no engine names them, or they all name
 * them equally, there is no leader and inventing one would be reading noise.
 */
function BestEngine() {
  const { tracking } = useDashboard();
  const byEngine = (tracking?.byEngine ?? []).filter((e) => e.checked > 0);
  if (byEngine.length < 2) return null;

  const rated = byEngine
    .map((e) => ({ engine: e.engine, rate: (e.cited + e.mentioned) / e.checked }))
    .sort((a, b) => b.rate - a.rate);

  const [best, second] = rated;
  if (!best || best.rate === 0 || best.rate === second?.rate) return null;

  return (
    <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
      {best.engine} names you most often.
    </p>
  );
}

/**
 * What a business in this trade should have, and what to write about.
 *
 * ⚠️ EVERY WORD HERE WAS GENERATED FOR THIS INDUSTRY AND STORED. The labels,
 * the reasons a page matters, the article angles — all of it comes off the
 * ContentPlan that /api/dashboard/content produced for this site. Nothing on
 * this page composes advice of its own. A plausible sentence about roofing that
 * no model wrote is the fabrication this codebase keeps refusing, and it would
 * be indistinguishable from the real thing to the person reading it.
 *
 * ⚠️ RENDERS NOTHING WITHOUT A PLAN — no generate button, no model call from
 * the audit. The link to build one is the caller's job.
 */
export function IndustryPlan({ pages }: { pages: PageContent[] }) {
  const { site, contentPlan } = useDashboard();
  if (!contentPlan || !site) return null;

  /* ⚠️ report.pages, NOT report.crawled. matchMustHave scores a page on its URL
     slug AND its title — see the note on `separator` in lib/content.ts about
     the two dialects a page announces itself in — and CrawledPage carries no
     title. Passing crawled rows would silently halve the match rate and report
     pages as missing that exist. content-workspace.tsx reads
     site.lastAudit.pages for the same reason. */
  const matched = matchMustHave(pages, contentPlan.mustHave);
  const missing = matched.filter((m) => !m.page);
  const trade = contentPlan.industry.toLowerCase();

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<DocIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
          Standing out as a {trade}
        </SectionTitle>
        <Link
          href="/dashboard/content"
          className="text-primary hover:text-primary-hover shrink-0 text-sm font-semibold print:hidden"
        >
          See all →
        </Link>
      </div>
      <p className="text-slate mt-1 text-sm">
        What customers in your trade look for, and what AI expects to find.
      </p>

      {matched.length > 0 ? (
        <div className="mt-4">
          <p className="text-navy text-sm font-semibold">Pages a {trade} needs</p>
          <ul className="mt-2 space-y-2.5">
            {matched.map((m) => (
              <li key={m.role} className="flex gap-2.5">
                {m.page ? (
                  <Check className="text-success-ink mt-[0.4rem] shrink-0" />
                ) : (
                  /* Not a cross. A page you have not written is a gap, not a
                     failure, and the sentence beside it is the model's own
                     reason for why it matters. */
                  <span aria-hidden="true" className="bg-line mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full" />
                )}
                {/* ⚠️ THE REASON GETS ITS OWN LINE, NOT AN EM-DASH AFTER THE
                    NAME. Run together they read as one long sentence — which is
                    how they scored as one — and the name is the thing being
                    scanned. Two lines: what it is, then why it matters. */}
                <div className="min-w-0">
                  <p className="text-navy text-[0.9375rem] leading-snug font-medium">{m.label}</p>
                  {m.page ? null : (
                    <p className="text-slate mt-0.5 text-[0.9375rem] leading-relaxed">{m.why}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {contentPlan.topics.length > 0 ? (
        <div className="border-line mt-5 border-t pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-navy text-sm font-semibold">Worth writing about</p>
            <Badge tone="cyan">{contentPlan.topics.length}</Badge>
          </div>
          <ul className="mt-2 space-y-3">
            {contentPlan.topics.slice(0, 3).map((t) => (
              <li key={t.title}>
                <p className="text-navy text-[0.9375rem] leading-snug font-medium">{t.title}</p>
                {/* The AEO question, because it is the concrete thing: this is
                    what somebody says out loud to an assistant. */}
                <p className="text-slate mt-0.5 text-sm leading-relaxed">
                  Someone asks AI: “{t.aeoQuestion}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <p className="text-slate mt-4 text-sm">
          {missing.length} of these {missing.length === 1 ? 'is' : 'are'} missing from your site.
        </p>
      ) : null}
    </Card>
  );
}

/** Shown in place of the plan when none has been generated. */
export function IndustryPlanPrompt() {
  const { site, contentPlan } = useDashboard();
  if (contentPlan || !site?.industry) return null;

  return (
    <Card tone="cloud" className="p-5 print:hidden">
      <p className="text-navy text-sm font-semibold">
        See what a {site.industry.toLowerCase()} should have on their site
      </p>
      <p className="text-slate mt-1 text-sm leading-relaxed">
        The pages customers in your trade look for, and the questions worth writing about.
      </p>
      <Link
        href="/dashboard/content"
        className="text-primary hover:text-primary-hover mt-3 inline-block text-sm font-semibold"
      >
        Build my list →
      </Link>
    </Card>
  );
}
