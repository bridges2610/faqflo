'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import { isPro, trackingPlanFor, TRACKING_PLANS } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { COMPETITOR_CAP } from '@/lib/dashboard/store';
import { CompetitorRow } from './competitor-row';
import { CompetitorSummary } from './competitor-summary';
import { EmptyState } from './empty-state';
import { GlobeIcon, ChevronIcon, SearchIcon } from './nav-icons';
import { SourceRow } from './source-row';
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
  const { site, tracking, competitors: watched, addCompetitor, user } = useDashboard();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPlatforms, setShowPlatforms] = useState(false);

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
  /* ⚠️ THE SAME JOIN, THE SAME KEY. The trend is already computed for every
     domain the engines cited — see buildTracking — so a watched rival gets its
     movement for free. A rival AI has never cited has no measured row at all,
     which is `undefined` here and renders as "no trend yet" rather than as a
     flat line: nothing to compare is not the same as no change. */
  const trendByDomain = new Map(measured.map((c) => [c.domain, c.trend]));

  /*
    Where this page's numbers come from, said on the page itself.

    ⚠️ EVERY PART OF THIS SENTENCE IS READ, NOT ASSERTED. The engines are the
    ones with `checked > 0` — naming all three when Gemini never answered would
    be a claim about work we did not do — and the question count is the distinct
    questions actually put to them, not the prompts on the watch list, which can
    differ. "Every week" is safe here and only here: this route is Pro-only
    (requirePro in its page.tsx), and free checks are pressed by hand.

    ⚠️ IT DEGRADES TO A PROMISE, NOT A ZERO. Before the first run there are no
    engines and no questions, so the sentence describes what will happen rather
    than reporting that nothing did.
  */
  const enginesUsed = (tracking?.byEngine ?? []).filter((e) => e.checked > 0).map((e) => e.engine);
  const askedCount = new Set((tracking?.latest ?? []).map((c) => c.question)).size;

  const engineList =
    enginesUsed.length > 1
      ? `${enginesUsed.slice(0, -1).join(', ')} and ${enginesUsed[enginesUsed.length - 1]}`
      : (enginesUsed[0] ?? 'the AI tools');

  /*
    ⚠️ "We ask again every week" IS A PRO PROMISE AND MUST NOT BE MADE TO FREE.
    This sentence was hardcoded when only Pro could open this screen. Free's
    schedule is 'once' (see TRACKING_PLANS), so telling a free account we will
    ask again weekly is a claim about work that will not happen — and they now
    read this page. The cadence comes off the plan instead.
  */
  const weekly = trackingPlanFor(user).schedule === 'weekly';

  const sourceLine =
    enginesUsed.length > 0 && askedCount > 0
      ? `Every website ${engineList} pointed to when we asked them ${askedCount} ${
          askedCount === 1 ? 'question' : 'questions'
        } about ${site.name}.${weekly ? ' We ask again every week.' : ''}`
      : `Once your first check runs, this shows every website the AI tools pointed to when answering questions about ${site.name}.`;

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

  const ranked = measured.map((c, i) => ({ ...c, rank: i + 1 }));

  /*
    ⚠️ THE OWNER'S OWN LIST OVERRIDES OURS. A domain they typed into the watch
    list above is a rival because they said so, and that is a stronger signal
    than a hardcoded list in lib/dashboard/platforms.ts. Without this, watching
    a marketplace you genuinely compete with would file it under directories and
    hide the very row you asked us to keep an eye on.
  */
  const watchedDomains = new Set(watched.map((c) => c.domain));
  const isBusiness = (c: (typeof ranked)[number]) =>
    c.kind === 'business' || watchedDomains.has(c.domain);

  /*
    Two groups, and NOTHING IS DISCARDED — the platform rows keep their counts
    and their ranks, they are just not what the reader came for. Deleting them
    would break the totals printed above and would hide a real finding: an
    account losing to directories rather than to rivals needs to know that.
  */
  const businesses = ranked.filter(isBusiness);
  const platforms = ranked.filter((c) => !isBusiness(c));

  /*
    Rank before slicing, and keep the customer's own row whatever its rank.

    Being 40th is a real reading and cutting it off would turn a bad result into
    a missing one — the reader would see ten rivals and no sign of themselves,
    which looks like a bug rather than the finding it is.
  */
  const shareRows = businesses.slice(0, SHARE_ROWS);
  const you = ranked.find((c) => c.isYou);
  if (you && !shareRows.some((c) => c.isYou)) shareRows.push(you);

  // Bars are relative to the top row, not to the total: the question is who is
  // ahead of you, and against a 900-source total every bar would be a sliver.
  const shareTop = Math.max(...shareRows.map((c) => c.citations), 1);
  const platformTop = Math.max(...platforms.map((c) => c.citations), 1);

  return (
    <>
      <PageHeader className="mb-2" title="Competitors" description={sourceLine} />

      {/*
        ⚠️ THE CEILING, ON THE ONE SCREEN THAT NEVER MENTIONED IT. Everything on
        this page is real for a free account — it is built from the checks that
        actually ran — but three questions asked once produces a thin list, and
        without this line that thinness reads as "hardly anyone is being cited"
        rather than "we have not asked much yet".

        ⚠️ IT COMPARES, IT DOES NOT WITHHOLD. Nothing here is hidden from free;
        the sentence exists so the reader knows what would make the same page
        say more. LOCKED IS NOT DISABLED, and this is not even locked.
      */}
      {user && !isPro(user) && (
        <p className="text-slate mb-4 text-sm leading-relaxed">
          This is built from the questions your one check asked. Pro puts{' '}
          <span className="text-navy font-semibold">
            {TRACKING_PLANS.pro.promptCap} questions
          </span>{' '}
          to the engines every week, so this list keeps filling in.{' '}
          <Link href="/dashboard/plan" className="text-primary hover:text-primary-hover font-semibold">
            See what Pro includes
          </Link>
        </p>
      )}

      {/* ⚠️ ATTRIBUTION, NOT NAVIGATION, WHICH IS WHY IT SITS UNDER THE
          DESCRIPTION RATHER THAN IN PageHeader's action SLOT. That slot is
          right-aligned on wide screens, which would put "where did this come
          from" a column away from the sentence it answers.

          ⚠️ AND THE CLAIM IS TRUE. Everything on this page is derived from the
          same SiteTracking object the AI Mentions page renders — buildTracking
          in lib/dashboard/store.ts builds both from citation_checks in one
          pass. The one difference worth knowing is the slice: these counts read
          EVERY check in the window, while the grid on AI Mentions reads
          `latest`, deduped to the most recent result per question and engine.
          Same source, so the two can never contradict each other; different
          spans, so a domain's count here can exceed what one run shows. */}
      <p className="text-slate mb-5 text-sm">
        Counted from your{' '}
        <Link
          href="/dashboard/tracking"
          className="text-primary hover:text-primary-hover font-semibold"
        >
          AI Mentions checks
        </Link>
        , where you can see each answer in full.
      </p>

      {/* ⚠️ THE SUMMARY GOES ABOVE THE WATCH LIST, WHICH REVERSES THE NOTE AT
          THE TOP OF THIS FILE. That note put the list you can act on first, and
          it was right while the page was two lists. A summary is a different
          kind of thing: it answers "how am I doing", which is the question that
          comes before "what do I do about it". It removes itself entirely when
          there is nothing measured, so the watch list is still the first thing
          a new account sees. */}
      <CompetitorSummary sources={measured} appearances={appearances} />

      {/* The list you keep. It is the one you can act on. */}
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
                trend={trendByDomain.get(c.domain) ?? null}
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

        {businesses.length > 0 ? (
          <>
            <p className="text-navy mt-5 text-sm font-semibold">Businesses like yours</p>
            <ul className="mt-3 space-y-4">
              {shareRows.map((c) => (
                <SourceRow
                  key={c.domain}
                  source={c}
                  rank={c.rank}
                  topCitations={shareTop}
                  watched={watchedDomains.has(c.domain)}
                />
              ))}
            </ul>
            {businesses.length > shareRows.length ? (
              <p className="text-slate mt-4 text-xs">
                and {formatNumber(businesses.length - shareRows.length)} more businesses AI used at
                least once.
              </p>
            ) : null}
          </>
        ) : (
          /* ⚠️ A FINDING, NOT AN EMPTY STATE. Every source being a directory is
             the answer to the question this page asks, and saying "no results"
             would throw it away. */
          <p className="text-slate mt-5 text-sm leading-relaxed">
            Every website AI used was a directory or a big platform rather than a business like
            yours. That is worth knowing on its own — it means the opening is still there.
          </p>
        )}

        {platforms.length > 0 ? (
          <div className="border-line mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowPlatforms((v) => !v)}
              aria-expanded={showPlatforms}
              aria-controls="platform-sources"
              className="text-slate hover:text-navy inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
            >
              <ChevronIcon
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  showPlatforms ? 'rotate-90' : ''
                }`}
              />
              Big sites and directories ({platforms.length})
            </button>
            <p className="text-slate mt-1 text-xs leading-relaxed">
              Review sites, forums and marketplaces. You can’t out-rank them, but being listed on
              them is often how AI finds you.
            </p>

            {showPlatforms && (
              <ul id="platform-sources" className="mt-4 space-y-4">
                {platforms.slice(0, SHARE_ROWS).map((c) => (
                  <SourceRow key={c.domain} source={c} rank={c.rank} topCitations={platformTop} />
                ))}
              </ul>
            )}

            {showPlatforms && platforms.length > SHARE_ROWS ? (
              <p className="text-slate mt-4 text-xs">
                and {formatNumber(platforms.length - SHARE_ROWS)} more.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
      ) : null}
    </>
  );
}
