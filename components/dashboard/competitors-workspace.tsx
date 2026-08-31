'use client';

import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import { useDashboard } from '@/lib/dashboard/provider';
import { EmptyState } from './empty-state';
import { Meter } from './meter';
import { GlobeIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SectionTitle } from './section-title';

/*
  Who AI reads instead of you.

  ⚠️ THIS PAGE HAS TWO LISTS AND THEY ARE NOT THE SAME KIND OF THING. The one
  below is MEASURED: every website the engines actually drew on, counted from
  citation_checks, ranked by how often. Nobody chose its contents, which is why
  it has no add button, no delete and no drag — reordering a measurement is not
  a feature, it is a lie with a handle on it.

  A second list is coming above it: the rivals the owner NAMES, stored in
  public.competitors (migration 0015), with the edit, delete and reorder that a
  list you own should have. Its counts will come from the same measurements,
  matched by domain, and a watched competitor AI never cited must read as a
  measured zero rather than a blank — the absence is the finding.

  ⚠️ IT MOVED HERE FROM Results, WHOLE. This was the last card on the tracking
  page, below the evidence and the per-engine summary, where it read as an
  afterthought. It is the answer to the second question a business owner asks —
  "then who is it naming?" — and that deserves its own destination rather than
  a scroll.
*/

/** Rows shown before the list is cut off. Ten domains is a page, not a dump. */
const SHARE_ROWS = 10;

export function CompetitorsWorkspace() {
  const { site, tracking } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Competitors" description="Who AI names instead of you." />
        <EmptyState
          title="Add a site first"
          body="Competitors are worked out per site, from the answers we collect about it."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  const competitors = tracking?.competitors ?? [];
  const appearances = tracking?.sourceAppearances ?? { ours: 0, total: 0 };

  if (competitors.length === 0) {
    return (
      <>
        <PageHeader title="Competitors" description="Who AI names instead of you." />
        <EmptyState
          title="Nothing to compare yet"
          body="Once we have asked the AI tools your questions, this fills with the websites they used to answer them."
          action={<ButtonLink href="/dashboard/tracking">Go to AI Mentions</ButtonLink>}
        />
      </>
    );
  }

  /*
    Rank before slicing, and keep the customer's own row whatever its rank.

    Being 40th is a real reading and cutting it off would turn a bad result into
    a missing one — the reader would see ten rivals and no sign of themselves,
    which looks like a bug rather than the finding it is.
  */
  const ranked = competitors.map((c, i) => ({ ...c, rank: i + 1 }));
  const shareRows = ranked.slice(0, SHARE_ROWS);
  const you = ranked.find((c) => c.isYou);
  if (you && !shareRows.some((c) => c.isYou)) shareRows.push(you);

  // Bars are relative to the top row, not to the total: the question is who is
  // ahead of you, and against a 900-source total every bar would be a sliver.
  const shareTop = Math.max(...shareRows.map((c) => c.citations), 1);

  return (
    <>
      <PageHeader
        className="mb-4"
        title="Competitors"
        description={`The websites AI used to answer questions about ${site.name}.`}
      />

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<GlobeIcon className="h-4 w-4" />} tint="bg-cloud text-slate">
            Who the AI reads instead
          </SectionTitle>
          <Badge tone="cyan">{formatNumber(competitors.length)} websites</Badge>
        </div>
        <p className="text-slate mt-1 text-sm">
          Most-used first. Yours is highlighted. {formatNumber(appearances.ours)} of{' '}
          {formatNumber(appearances.total)} were yours.
        </p>

        <ul className="mt-5 space-y-4">
          {shareRows.map((c) => (
            <li key={c.domain}>
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className={`min-w-0 truncate text-sm ${
                    c.isYou ? 'text-navy font-semibold' : 'text-slate'
                  }`}
                >
                  {c.rank}. {c.domain}
                  {c.isYou && ' (you)'}
                </p>
                <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                  {c.citations}
                </p>
              </div>
              <Meter
                className="mt-1.5"
                value={(c.citations / shareTop) * 100}
                tone={c.isYou ? 'primary' : 'line'}
              />
            </li>
          ))}
        </ul>

        {competitors.length > shareRows.length && (
          <p className="text-slate mt-4 text-xs">
            and {formatNumber(competitors.length - shareRows.length)} more websites AI used at
            least once.
          </p>
        )}
      </Card>
    </>
  );
}
