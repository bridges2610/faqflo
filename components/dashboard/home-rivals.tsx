'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { Meter } from './meter';
import { SearchIcon } from './nav-icons';
import { SectionTitle } from './section-title';

/*
  Who AI reads instead, in the space beside the chart.

  ⚠️ IT EXISTS TO BALANCE A ROW, AND IT STILL HAS TO EARN ITS PLACE. The chart
  is wide and short; without something beside it the row was a chart and a gap.
  But a filler card would be worse than the gap, so this is the one question a
  business owner asks straight after "am I showing up" — who is, instead.

  ⚠️ BUSINESSES ONLY, LIKE THE COMPETITORS PAGE. `kind` is set upstream in
  lib/dashboard/platforms.ts, and without this filter the top row on a
  local-services account is reddit.com — which is how Home used to introduce a
  forum as somebody's competitor.

  ⚠️ SAME ARRAY, SAME ORDER, JUST SHORTER. tracking.competitors arrives ranked,
  so this cannot disagree with the page it links to.
*/
export function HomeRivals() {
  const { tracking } = useDashboard();

  const businesses = (tracking?.competitors ?? []).filter((c) => c.kind === 'business');
  const top = businesses.slice(0, 6);
  const you = businesses.find((c) => c.isYou);

  /* Being fifth is a reading; cutting it turns a bad result into a missing one.
     Same rule the Competitors page follows for its own ranking. */
  const rows = you && !top.some((c) => c.isYou) ? [...top, you] : top;
  if (rows.length === 0) return null;

  const scale = Math.max(...rows.map((c) => c.citations), 1);

  return (
    /* h-full so the card fills the stretched grid track rather than sitting
       at the top of it with a gap underneath. */
    <Card className="flex h-full flex-col p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={<SearchIcon className="h-4 w-4" />} tint="bg-cloud text-slate">
          Who AI reads instead
        </SectionTitle>
        <Link
          href="/dashboard/competitors"
          className="text-primary hover:text-primary-hover shrink-0 text-sm font-semibold"
        >
          See all →
        </Link>
      </div>

      {/* ⚠️ space-y, NOT justify-between. Spreading three rows to fill a tall
          card would put arbitrary distance between them and make the gaps look
          like data. Even spacing at the top, and the room left over is just
          room. */}
      <ul className="mt-4 space-y-3">
        {rows.map((c) => (
          <li key={c.domain}>
            <div className="flex items-baseline justify-between gap-3">
              <p
                className={`min-w-0 truncate text-xs ${
                  c.isYou ? 'text-navy font-semibold' : 'text-slate'
                }`}
              >
                {c.domain}
                {c.isYou && ' (you)'}
              </p>
              <p className="text-navy shrink-0 text-xs font-semibold tabular-nums">{c.citations}</p>
            </div>
            {/* One scale for every row, or the comparison is a lie. */}
            <Meter className="mt-1" value={(c.citations / scale) * 100} tone={c.isYou ? 'primary' : 'line'} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
