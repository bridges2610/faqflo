'use client';

import { Card } from '@/components/ui/card';
import { scoreBand } from '@/lib/audit/score';
import type { AuditReport } from '@/lib/audit/types';
import { useDashboard } from '@/lib/dashboard/provider';
import { MetricTile } from './metric-tile';
import { AeoIcon, ChartIcon, FaqIcon, SearchIcon } from './nav-icons';

/*
  The row across the top of the dashboard.

  ⚠️ THIS IS A RETURN, NOT AN INVENTION, AND THE REASON IT LEFT STILL APPLIES.
  metric-tile.tsx opens with "one figure in the row across the top of the
  dashboard" and names Home as one of three screens carrying it; the row was
  stripped when Home was simplified, leaving that component with one consumer
  and visibility-panel.tsx and sparkline.tsx with none.

  What got it deleted was not the shape but the arithmetic: it "counted things
  for itself and could therefore disagree with the pages it summarised". So
  every value below is read off the same object its destination page reads —
  the score off site.lastAudit, the citation figures off tracking, the answer
  count off faqs — and nothing here computes a figure a second way.

  ⚠️ NO SCORE SPARKLINE, DELIBERATELY. The obvious flourish is a line of past
  scores, and overview-workspace.tsx records why the last one was removed: runs
  of different DEPTH are not comparable — a quick run scores 3 findings across
  2 pillars and a full one about 40 across 6 — so a line through both "draws a
  cliff that never happened to the customer's website". The chart below this row
  plots citations instead, which carry no such trap.

  ⚠️ A TILE WITH NOTHING MEASURED IS OMITTED, AND AN EMPTY ROW DOES NOT RENDER.
  The note left behind by the old row: "Four cells reading '—' is worse than no
  row at all — it fills the top of the screen with the shape of information
  while telling them nothing."
*/

export function HomeSnapshot({ report }: { report: AuditReport | null }) {
  const { tracking, faqs, questions } = useDashboard();

  const latest = tracking?.latest ?? [];
  const named = latest.filter((c) => c.outcome === 'cited' || c.outcome === 'mentioned').length;
  const you = (tracking?.competitors ?? []).find((c) => c.isYou);
  const appearances = tracking?.sourceAppearances ?? { ours: 0, total: 0 };

  const live = faqs.filter((f) => f.status === 'published').length;
  const unanswered = questions.filter((q) => !q.covered).length;

  const band = report ? scoreBand(report.score) : null;

  /* Built as a list so the row can be counted before it is drawn — four cells,
     three cells and one cell are all legitimate, and none is a gap. */
  const tiles = [
    report && band ? (
      <MetricTile
        key="score"
        label="Visibility score"
        value={report.score}
        footer={band.label}
        /* `status` is allowed here precisely because the footer names the band
           in words beside it — the condition metric-tile.tsx sets on this prop. */
        status={
          report.score >= 85
            ? 'bg-success'
            : report.score >= 60
              ? 'bg-accent'
              : report.score >= 30
                ? 'bg-warn'
                : 'bg-error'
        }
        href="/dashboard/audit"
        icon={<AeoIcon className="h-3.5 w-3.5" />}
        tint="bg-primary-soft text-primary"
      />
    ) : null,

    latest.length > 0 ? (
      <MetricTile
        key="named"
        label="Answers naming you"
        value={`${named} of ${latest.length}`}
        /* ⚠️ A BAR ONLY BECAUSE THE VALUE PRINTS BOTH HALVES. meter.tsx's
           standing contract: the bar is a second encoding of a proportion that
           is already readable, never the only place it exists. */
        progress={{ value: named, total: latest.length }}
        footer={named > 0 ? 'You’re in the conversation' : 'Not showing up yet'}
        href="/dashboard/tracking"
        icon={<ChartIcon className="h-3.5 w-3.5" />}
        tint="bg-accent-soft text-teal-ink"
      />
    ) : null,

    you && appearances.total > 0 ? (
      <MetricTile
        key="share"
        label="Your share of voice"
        value={`${you.share > 0 && you.share < 1 ? '<1' : Math.round(you.share)}%`}
        /* No progress bar: the value is a percentage with its denominator in
           the footer, not an "x of y" printed in full. */
        /* ⚠️ THE DENOMINATOR IS NAMED. This read "3 of every source AI used",
           which states a numerator and then refuses to say what it is out of.
           sourceAppearances carries both halves and the Competitors page prints
           the same pair. */
        footer={`${you.citations} of ${appearances.total} sources AI used`}
        href="/dashboard/competitors"
        icon={<SearchIcon className="h-3.5 w-3.5" />}
        tint="bg-cloud text-slate"
      />
    ) : null,

    live > 0 || unanswered > 0 ? (
      <MetricTile
        key="answers"
        label="Answers on your site"
        value={live}
        footer={
          unanswered > 0
            ? `${unanswered} question${unanswered === 1 ? '' : 's'} still unanswered`
            : 'Every question answered'
        }
        href="/dashboard/faqs"
        icon={<FaqIcon className="h-3.5 w-3.5" />}
        tint="bg-success/12 text-success-ink"
      />
    ) : null,
  ].filter(Boolean);

  if (tiles.length === 0) return null;

  return (
    /*
      ⚠️ ONE CARD WITH DIVIDERS, NOT FOUR CARDS. metric-tile.tsx says so and the
      cells carry no border or shadow of their own — four separate cards would
      read as four unrelated things rather than one reading of one business.

      Two across on a phone rather than four squashed or one long stack: these
      are short figures, and a 2×2 keeps the whole row above the fold.
    */
    <Card className="grid grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <div
          key={i}
          className={`border-line ${i % 2 === 1 ? 'border-l' : ''} ${
            i >= 2 ? 'border-t' : ''
          } lg:border-t-0 ${i > 0 ? 'lg:border-l' : 'lg:border-l-0'}`}
        >
          {tile}
        </div>
      ))}
    </Card>
  );
}
