'use client';

import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import type { CompetitorShare } from '@/lib/dashboard/types';
import { Meter } from './meter';
import { SiteMark } from './site-mark';
import { ChartIcon } from './nav-icons';
import { SectionTitle } from './section-title';

/*
  The whole competitor picture, in one card, at the top of the page.

  ⚠️ IT ANSWERS "WHERE IS THE ATTENTION GOING", WHICH NEITHER LIST BELOW DOES.
  The watch list is who you told us to follow and the ranked list is everyone
  cited — both are lists, and a list of thirty domains does not tell you that
  two-thirds of every citation went to directories. That is one shape, and this
  is the shape.

  ⚠️ NOT A SECOND SOURCE OF TRUTH. Both panels read the same arrays the lists
  below read, sliced. Nothing is recounted here, so the summary and the detail
  cannot disagree — which is the failure mode a summary card invites.

  ⚠️ THE STACKED BAR IS THE SAME GRAMMAR AS OutcomeBar in engine-detail.tsx: an
  aria-hidden bar over labelled counts that are real text. Kept as a sibling
  rather than a shared component because OutcomeBar's segments are citation
  OUTCOMES (cited / named / absent) and these are source KINDS — different
  measurements that happen to draw alike. If a third stacked bar appears, that
  is the moment to extract one, the way status-icon.tsx was extracted on its
  third copy and not its second.
*/

/** One segment of the share bar: a fill, a count, and what it is. */
type Segment = { key: string; label: string; count: number; fill: string; ink: string };

export function CompetitorSummary({
  sources,
  appearances,
}: {
  /** Every measured domain, ranked — `tracking.competitors`. */
  sources: CompetitorShare[];
  appearances: { ours: number; total: number };
}) {
  /* ⚠️ NOTHING TO SUMMARISE IS NOT AN EMPTY CHART. An account before its first
     run still needs the watch list underneath this, so the card removes itself
     rather than drawing zero-width segments over a zero total. */
  if (sources.length === 0 || appearances.total === 0) return null;

  const you = sources.find((c) => c.isYou);
  const rivals = sources.filter((c) => !c.isYou && c.kind === 'business');
  const platforms = sources.filter((c) => c.kind === 'platform');

  const yours = you?.citations ?? 0;
  const rivalCount = rivals.reduce((n, c) => n + c.citations, 0);
  const platformCount = platforms.reduce((n, c) => n + c.citations, 0);

  /*
    ⚠️ THE SEGMENTS MUST SUM TO THE TOTAL, AND THIS IS WHERE THAT IS ENFORCED.

    you + rivals + platforms is every source by construction — `kind` is one of
    two values and `isYou` is carved out of 'business' upstream. If that ever
    stops being true the bar would be drawn against a denominator it does not
    fill, so the total used here is the segments' own sum and the stated figure
    is checked against it rather than assumed.
  */
  const summed = yours + rivalCount + platformCount;
  const total = appearances.total;
  const trustworthy = summed === total;

  const segments: Segment[] = [
    { key: 'you', label: 'You', count: yours, fill: 'bg-primary', ink: 'text-primary' },
    {
      key: 'rivals',
      label: rivalCount === 1 ? 'Rival business' : 'Rival businesses',
      count: rivalCount,
      fill: 'bg-accent',
      ink: 'text-teal-ink',
    },
    {
      key: 'platforms',
      label: 'Directories & big sites',
      count: platformCount,
      fill: 'bg-line',
      ink: 'text-slate',
    },
  ];

  /* Top five, with the customer kept in view whatever their rank — the same
     rule the full list follows, and for the same reason: being eleventh is a
     reading, and cutting it turns a bad result into a missing one. */
  const leaders = rivals.slice(0, 5);
  const shown = you && !leaders.some((c) => c.isYou) ? [...leaders, you] : leaders;
  const ranked = [...shown].sort((a, b) => b.citations - a.citations);
  const top = Math.max(...ranked.map((c) => c.citations), 1);

  const sharePct = (yours / summed) * 100;

  return (
    <Card className="mb-5 p-5 sm:p-7">
      <SectionTitle icon={<ChartIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
        How the citations split
      </SectionTitle>

      <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-8">
        {/* ── Left: where every citation went ─────────────────────────── */}
        <div>
          <p className="text-navy text-3xl leading-none font-semibold tabular-nums">
            {sharePct > 0 && sharePct < 1 ? '<1' : Math.round(sharePct)}%
          </p>
          <p className="text-slate mt-1.5 text-sm leading-relaxed">
            of the {formatNumber(summed)} sources AI used were yours.
          </p>

          <div className="bg-cloud mt-4 flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
            {segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.key} className={s.fill} style={{ width: `${(s.count / summed) * 100}%` }} />
              ))}
          </div>

          {/* ⚠️ THREE COLUMNS AT EVERY WIDTH, INCLUDING A PHONE, and a zero is
              muted rather than dropped. The three cells are the whole — the bar
              above says so — and removing one would reflow the grid and quietly
              break that claim. Same rule as OutcomeBar. */}
          <ul className="mt-4 grid grid-cols-3 gap-x-3">
            {segments.map((s) => (
              <li key={s.key}>
                <p
                  className={`text-lg leading-none font-semibold tabular-nums ${
                    s.count === 0 ? 'text-slate/50' : s.ink
                  }`}
                >
                  {formatNumber(s.count)}
                </p>
                <p className="text-slate mt-1 text-[0.6875rem] leading-snug">{s.label}</p>
              </li>
            ))}
          </ul>

          {/*
            The one sentence the three numbers add up to.

            ⚠️ READ OFF THE SEGMENTS, NOT WRITTEN ABOUT THEM. Both figures below
            are the counts already on screen turned into a percentage of the
            same denominator, so the sentence cannot say something the bar does
            not show. It also fills a column that was otherwise a bar and three
            numbers against a five-row list beside it.
          */}
          <p className="text-slate mt-4 text-sm leading-relaxed">
            {platformCount > rivalCount + yours
              ? `Most citations go to directories and big sites — ${Math.round(
                  (platformCount / summed) * 100,
                )}% of them. Being listed on those is often how AI finds you.`
              : rivalCount > yours
                ? `Rival businesses take ${Math.round(
                    (rivalCount / summed) * 100,
                  )}% of the citations. Every one of those is a question you could be answering.`
                : `You are the most-cited business here, on ${Math.round(
                    (yours / summed) * 100,
                  )}% of every source AI used.`}
          </p>

          {/* Only ever shown if the arithmetic disagrees with the stored total.
              Silence would be the bug; a chart that quietly drops sources is
              worse than one that says it did. */}
          {!trustworthy && (
            <p className="text-slate mt-3 text-[0.6875rem] leading-relaxed">
              Counted from {formatNumber(summed)} of {formatNumber(total)} recorded sources.
            </p>
          )}
        </div>

        {/* ── Right: who is actually winning ──────────────────────────── */}
        <div>
          <p className="text-navy text-sm font-semibold">Most-cited businesses</p>
          <p className="text-slate mt-1 text-xs leading-relaxed">
            Directories and big sites are left out of this one.
          </p>

          {ranked.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {ranked.map((c) => (
                <li key={c.domain}>
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={`flex min-w-0 items-center gap-2 truncate text-xs ${
                        c.isYou ? 'text-navy font-semibold' : 'text-slate'
                      }`}
                    >
                      <SiteMark domain={c.domain} className="h-5 w-5 text-[0.625rem]" />
                      {c.domain}
                      {c.isYou && ' (you)'}
                    </p>
                    <p className="text-navy shrink-0 text-xs font-semibold tabular-nums">
                      {c.citations}
                    </p>
                  </div>
                  <Meter
                    className="mt-1"
                    value={(c.citations / top) * 100}
                    tone={c.isYou ? 'primary' : 'line'}
                  />
                </li>
              ))}
            </ul>
          ) : (
            /* ⚠️ A FINDING, NOT AN EMPTY STATE. Every source being a directory
               is the answer to the question this page asks. */
            <p className="text-slate mt-4 text-sm leading-relaxed">
              No business like yours was cited at all — every source was a directory or a big
              platform. That is an opening rather than a loss.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
