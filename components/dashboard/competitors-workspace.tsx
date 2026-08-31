'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import { useDashboard } from '@/lib/dashboard/provider';
import { COMPETITOR_CAP } from '@/lib/dashboard/store';
import { CompetitorRow } from './competitor-row';
import { EmptyState } from './empty-state';
import { Meter } from './meter';
import { GlobeIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SectionTitle } from './section-title';

/*
  Who AI reads instead of you.

  ⚠️ THIS PAGE HAS TWO LISTS AND THEY ARE NOT THE SAME KIND OF THING. The one
  below is MEASURED: every website the engines actually drew on, counted from
  citation_checks, ranked by how often. Nobody chose its contents, which is why
  it has no add button, no delete and no drag — reordering a measurement is not
  a feature, it is a lie with a handle on it.

  The list ABOVE it is the opposite: the rivals the owner NAMES, stored in
  public.competitors (0015), with the edit, delete and reorder that a list you
  own should have. Its counts come from the same measurements, matched by
  domain — which is why the store normalises that field on the way in, and why
  a watched rival AI never cited reads as a measured zero rather than a blank.
  The absence is the finding.

  ⚠️ IT MOVED HERE FROM Results, WHOLE. This was the last card on the tracking
  page, below the evidence and the per-engine summary, where it read as an
  afterthought. It is the answer to the second question a business owner asks —
  "then who is it naming?" — and that deserves its own destination rather than
  a scroll.
*/

/** Rows shown before the list is cut off. Ten domains is a page, not a dump. */
const SHARE_ROWS = 10;

/** What each refusal from addCompetitor means, in the customer's words. */
const ADD_ERROR: Record<string, string> = {
  'bad-domain': 'That doesn’t look like a website address. Try something like summitroofing.com.',
  duplicate: 'You’re already watching that website.',
  'own-domain': 'That’s your own website. It’s already in the list below.',
  cap: `You can watch ${COMPETITOR_CAP} competitors. Remove one to add another.`,
};

export function CompetitorsWorkspace() {
  const { site, tracking, competitors: watched, addCompetitor } = useDashboard();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  /* ⚠️ NAMED `measured`, NOT `competitors`. This file holds two lists and the
     bug worth designing out is using one where the other belongs. `watched` is
     the customer's; this is what the engines cited. */
  const measured = tracking?.competitors ?? [];
  const appearances = tracking?.sourceAppearances ?? { ours: 0, total: 0 };

  /*
    ⚠️ NO EARLY RETURN WHEN THERE ARE NO MEASUREMENTS. An account that has not
    run a check yet still has a use for this page — naming the rivals you want
    watched is exactly the thing to do BEFORE the first run, so the results mean
    something when they land. The measured card below hides itself; the watch
    list does not.
  */

  /* One pass, keyed by domain: the watch list is joined to the measurements by
     that value. See the note on Competitor in types.ts for why it is a bare
     host on both sides. */
  const mentionsByDomain = new Map(measured.map((c) => [c.domain, c.citations]));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!site) return;
    const result = await addCompetitor(site.id, { name, domain });
    if (result.ok) {
      setName('');
      setDomain('');
      setError(null);
      return;
    }
    setError(ADD_ERROR[result.reason] ?? 'That didn’t work.');
  }

  /*
    Rank before slicing, and keep the customer's own row whatever its rank.

    Being 40th is a real reading and cutting it off would turn a bad result into
    a missing one — the reader would see ten rivals and no sign of themselves,
    which looks like a bug rather than the finding it is.
  */
  const ranked = measured.map((c, i) => ({ ...c, rank: i + 1 }));
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

      {/* The list you keep, first. It is the one you can act on. */}
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<SearchIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
            Competitors you watch
          </SectionTitle>
          <Badge tone="cyan">
            {watched.length} of {COMPETITOR_CAP}
          </Badge>
        </div>
        <p className="text-slate mt-1 text-sm">
          Name the businesses you compete with. We count how often AI mentions them.
        </p>

        {watched.length > 0 && (
          <ul className="divide-line mt-4 divide-y">
            {watched.map((c, i) => (
              <CompetitorRow
                key={c.id}
                competitor={c}
                /* ⚠️ ?? 0, NOT `|| undefined`. A rival AI has never cited is a
                   measured zero, and that zero is the answer the owner asked
                   for by adding them. */
                mentions={mentionsByDomain.get(c.domain) ?? 0}
                isFirst={i === 0}
                isLast={i === watched.length - 1}
              />
            ))}
          </ul>
        )}

        {watched.length < COMPETITOR_CAP ? (
          <form onSubmit={add} className="border-line mt-4 border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Competitor name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summit Roofing"
                  className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-sm outline-none transition-colors duration-150"
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Their website</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="summitroofing.com"
                  className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-sm outline-none transition-colors duration-150"
                />
              </label>
              <Button type="submit" size="sm" disabled={!domain.trim()} className="shrink-0">
                Add
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-error-ink mt-2 text-sm">
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          /* ⚠️ THE LIMIT IS STATED, NOT ENFORCED BY A MISSING CONTROL. A form
             that silently disappears at ten leaves the reader hunting for what
             they did wrong. */
          <p className="text-slate border-line mt-4 border-t pt-4 text-sm">
            You’re watching {COMPETITOR_CAP} competitors, the most we track. Remove one to add
            another.
          </p>
        )}
      </Card>

      {measured.length > 0 ? (
      <Card className="mt-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<GlobeIcon className="h-4 w-4" />} tint="bg-cloud text-slate">
            Who the AI reads instead
          </SectionTitle>
          <Badge tone="cyan">{formatNumber(measured.length)} websites</Badge>
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

        {measured.length > shareRows.length ? (
          <p className="text-slate mt-4 text-xs">
            and {formatNumber(measured.length - shareRows.length)} more websites AI used at least
            once.
          </p>
        ) : null}
      </Card>
      ) : null}
    </>
  );
}
