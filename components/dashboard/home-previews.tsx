'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion } from '@/lib/dashboard/questions';
import type { AuditReport } from '@/lib/audit/types';
import { OutcomeBar, type OutcomeSplit } from './engine-detail';
import { Meter } from './meter';
import { AeoIcon, ChartIcon, FaqIcon, SearchIcon } from './nav-icons';

/*
  Home as a way in, not a screen of its own.

  ⚠️ EVERY NUMBER HERE IS ALREADY ON ANOTHER PAGE, AND NONE OF IT IS COMPUTED
  DIFFERENTLY. The four cards below are windows onto Audit, AI Mentions, Answers
  and Competitors — same source, same arithmetic, same words. A summary that
  did its own counting is how two screens end up disagreeing about how many
  answers a customer has, which is the sort of thing nobody reports; they just
  stop trusting the numbers.

  ⚠️ AND A CARD WITH NOTHING MEASURED SAYS SO. None of them fills a gap with a
  zero: no audit yet means "not checked yet", not a score of 0, because 0 is a
  reading and "we have not looked" is the truth.
*/

/** One window onto another screen. */
function Preview({
  href,
  icon,
  tint,
  title,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  tint: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      hover
      className="p-5"
      /* The whole card is the target. A small "view" link at the bottom of a
         card whose entire content is about one destination is a smaller hit
         area for the same journey. */
      as="li"
    >
      <Link href={href} className="block">
        <p className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}
          >
            {icon}
          </span>
          <span className="text-navy text-[0.9375rem] font-bold">{title}</span>
        </p>
        <div className="mt-4">{children}</div>
      </Link>
    </Card>
  );
}

/** A line of prose where a figure would be, for a card with nothing to show. */
function NotYet({ children }: { children: React.ReactNode }) {
  return <p className="text-slate text-sm leading-relaxed">{children}</p>;
}

export function HomePreviews({ report }: { report: AuditReport | null }) {
  const { tracking, faqs, questions } = useDashboard();

  const latest = tracking?.latest ?? [];
  const cited = latest.filter((c) => c.outcome === 'cited').length;
  const mentioned = latest.filter((c) => c.outcome === 'mentioned').length;
  const absent = latest.filter((c) => c.outcome === 'absent').length;

  const split: OutcomeSplit[] = [
    { outcome: 'cited', count: cited },
    { outcome: 'mentioned', count: mentioned },
    { outcome: 'absent', count: absent },
  ];

  const ready = faqs.filter((f) => f.status === 'published').length;
  const unanswered = questions.filter((q) => !q.covered).length;

  const competitors = tracking?.competitors ?? [];
  const you = competitors.find((c) => c.isYou);
  /* ⚠️ THE TOP BUSINESS, NOT THE TOP SOURCE. This read the first row that
     wasn't the customer, which on a local-services account is reddit.com or
     yelp.com — so Home introduced a forum as their competitor. The Competitors
     page groups these; this card only has room for one name, so it takes the
     first real business and falls back to the raw leader when every source is
     a platform, rather than showing nothing. */
  const top =
    competitors.find((c) => !c.isYou && c.kind === 'business') ??
    competitors.find((c) => !c.isYou);
  const scale = Math.max(you?.citations ?? 0, top?.citations ?? 0, 1);

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Preview
        href="/dashboard/audit"
        icon={<AeoIcon className="h-4 w-4" />}
        tint="bg-primary-soft text-primary"
        title="Audit"
      >
        {report ? (
          <div className="flex items-center gap-4">
            <ScoreDial score={report.score} size="sm" caption="out of 100" />
            <p className="text-slate text-sm leading-relaxed">
              How ready your website is for AI to read and quote.
            </p>
          </div>
        ) : (
          <NotYet>We haven’t read your website yet. Run a check to see how it looks to AI.</NotYet>
        )}
      </Preview>

      <Preview
        href="/dashboard/tracking"
        icon={<ChartIcon className="h-4 w-4" />}
        tint="bg-accent-soft text-teal-ink"
        title="AI Mentions"
      >
        {latest.length > 0 ? (
          <>
            <p className="text-navy text-sm font-semibold">
              Of the {latest.length} {latest.length === 1 ? 'answer' : 'answers'} we checked
            </p>
            {/* The same bar the AI Mentions page leads with, over the same
                counts — cited + named + absent is every check, by construction.
                See the note on OutcomeBar. */}
            <OutcomeBar splits={split} total={latest.length} className="mt-2.5" />
          </>
        ) : (
          <NotYet>
            Nobody has asked the AI tools about you yet. Your first check fills this in.
          </NotYet>
        )}
      </Preview>

      <Preview
        href="/dashboard/faqs"
        icon={<FaqIcon className="h-4 w-4" />}
        tint="bg-success/12 text-success-ink"
        title="Answers"
      >
        {faqs.length > 0 || unanswered > 0 ? (
          <div className="flex items-baseline gap-6">
            <p className="text-navy text-2xl leading-none font-semibold tabular-nums">
              {ready}
              <span className="text-slate ml-1.5 text-xs font-normal">ready to paste</span>
            </p>
            {unanswered > 0 ? (
              <p className="text-navy text-2xl leading-none font-semibold tabular-nums">
                {unanswered}
                <span className="text-slate ml-1.5 text-xs font-normal">still unanswered</span>
              </p>
            ) : null}
          </div>
        ) : (
          <NotYet>No answers written yet. This is the part AI actually reads.</NotYet>
        )}
      </Preview>

      <Preview
        href="/dashboard/competitors"
        icon={<SearchIcon className="h-4 w-4" />}
        tint="bg-cloud text-slate"
        title="Competitors"
      >
        {top ? (
          <div className="space-y-2.5">
            {/* ⚠️ TWO BARS ON ONE SCALE, OR THE COMPARISON IS A LIE. Both are
                drawn against the larger of the two counts, so the shorter bar
                is genuinely shorter. Scaling each to its own row would make
                3 and 31 look identical. */}
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-navy truncate text-sm font-semibold">You</p>
                <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                  {you?.citations ?? 0}
                </p>
              </div>
              <Meter className="mt-1" value={((you?.citations ?? 0) / scale) * 100} tone="primary" />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-slate min-w-0 truncate text-sm">{top.domain}</p>
                <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                  {top.citations}
                </p>
              </div>
              <Meter className="mt-1" value={(top.citations / scale) * 100} tone="line" />
            </div>
          </div>
        ) : (
          <NotYet>Once AI has answered your questions, this shows who it read instead.</NotYet>
        )}
      </Preview>
    </ul>
  );
}
