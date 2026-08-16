'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canTrack, engineChecksFor } from '@/lib/dashboard/plans';
import { formatNumber, timeAgo, timeUntil } from '@/lib/dashboard/format';
import { ENGINES, type CitationCheck, type Engine, type SiteTracking } from '@/lib/dashboard/types';
import { CitationChart } from './citation-chart';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { MetricTile } from './metric-tile';
import { Meter } from './meter';
import { AeoIcon, ChartIcon, GlobeIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';
import { SectionTitle } from './section-title';

/*
  Tracking — the differentiator, and the reason the subscription exists.

  Two things are load-bearing here:

  1. Every number is a count of checks we actually ran. Nothing is modelled,
     extrapolated or smoothed. "Cited 4 times" has to mean four answers we saw.
  2. The query cap is shown, not hidden. Each check costs money, so the plan
     buys a finite number of them — a customer who runs out should find out from
     the UI, not from results quietly going stale.
*/
/*
  Driving a run from the browser.

  ⚠️ THE CLIENT LOOPS BECAUSE THE SERVER CANNOT. A full period is 25 prompts
  against three search-backed engines; the route runs a bounded slice per
  request because this app holds itself to roughly the platform's ~60s ceiling
  and there is no queue in this project. So the button posts repeatedly until
  the route reports nothing left, and shows how far it has got.

  The route is idempotent — it works out what has not been checked today from
  what is already stored — so a refresh mid-run, a second tab, or an impatient
  double-click cannot double-spend the allowance.
*/
function useTrackingRun(
  siteId: string | undefined,
  questions: string[],
  onDone: () => Promise<SiteTracking | null>,
) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ checked: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  /*
    Its own channel, not a `notes` entry: `notes` renders under the fixed
    heading "Some engines didn't answer", and this is the opposite problem —
    the engines answered fine and the database would not give the rows back.
  */
  const [unreadable, setUnreadable] = useState<string | null>(null);

  async function run() {
    if (!siteId || questions.length === 0) return;

    setBusy(true);
    setError(null);
    setNotes([]);
    setUnreadable(null);
    let checked = 0;

    try {
      // Bounded rather than `while (true)`: a route that kept reporting work
      // remaining would otherwise bill this customer until they closed the tab.
      for (let pass = 0; pass < 12; pass++) {
        const res = await fetch('/api/dashboard/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, questions }),
        });

        const payload = (await res.json()) as {
          checked?: number;
          remaining?: number;
          done?: boolean;
          failures?: { engine: string; detail: string }[];
          error?: string;
        };

        // `break`, not `return`: the refresh in `finally` has to happen either
        // way. See the note there.
        if (!res.ok) {
          setError(payload.error ?? 'That run failed. Please try again.');
          break;
        }

        checked += payload.checked ?? 0;
        setProgress({ checked, remaining: payload.remaining ?? 0 });

        // Surfaced rather than swallowed: a run where one engine was
        // unconfigured produced a real but partial picture, and a low number
        // with no explanation reads as "nobody cites you".
        if (payload.failures?.length) {
          setNotes(payload.failures.map((f) => `${f.engine}: ${f.detail}`));
        }

        if (payload.done || !payload.remaining) break;
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      /*
        ⚠️ REFRESH EVEN WHEN THE RUN FAILED, AND ESPECIALLY THEN.

        A run is several requests, and the ones before the failure already
        asked the engines, spent the money and stored their rows. Refreshing
        only on the happy path left those rows sitting in Postgres with the
        page still showing "you haven't run a check yet" until someone
        reloaded — the run looked like it had done nothing when it had done
        most of its work.

        This is the same call the route makes when it reports engine failures
        instead of throwing (lib/tracking/run.ts): a partial result is a real
        result. The error still shows; it shows next to whatever we got.
      */
      try {
        const refreshed = await onDone();

        /*
          ⚠️ THE WRITE SUCCEEDED AND THE READ CAME BACK EMPTY. SAY SO.

          The server told us it checked `checked` questions, so those rows are
          in Postgres. If reading them back yields nothing, the two disagree,
          and the page is about to render "you haven't run a check yet" — the
          most misleading sentence available, because the checks ran and were
          paid for.

          This is not hypothetical: `citation_checks` grants the browser SELECT
          under an RLS policy (supabase/migrations/0006), and when that policy
          is missing PostgREST returns an empty array with no error at all.
          Nothing downstream can tell that apart from "no data yet", so it has
          to be caught here, where we know a run just stored rows.
        */
        if (checked > 0 && !refreshed) {
          setUnreadable(
            `${checked} ${checked === 1 ? 'check' : 'checks'} ran and were saved, but reading them back returned nothing. The results are not lost — the citation_checks read policy is the likely cause.`,
          );
        }
      } catch {
        // Leave the original error standing rather than replacing it with a
        // second one about the reload — the first is what went wrong.
      }
      setBusy(false);
    }
  }

  return { run, busy, progress, error, notes, unreadable };
}

/*
  One entry per question, with the engines that produced that outcome.

  Grouped because a question is checked against every engine, so the raw rows
  print it once per engine and read as duplication. "Cited by Perplexity and
  Gemini" is one fact about one question, not two facts.

  ⚠️ The "Not cited for" worklist deliberately does NOT use this. Each of its
  rows carries a different `citedInstead` — who took the click on that engine —
  which is the useful part, and each has its own Draft action.
*/
type Grouped = { question: string; engines: Engine[]; checkedAt: string };

function groupByQuestion(checks: CitationCheck[]): Grouped[] {
  const map = new Map<string, Grouped>();

  for (const check of checks) {
    const entry = map.get(check.question);
    if (!entry) {
      map.set(check.question, {
        question: check.question,
        engines: [check.engine],
        checkedAt: check.checkedAt,
      });
      continue;
    }
    if (!entry.engines.includes(check.engine)) entry.engines.push(check.engine);
    // Keep the most recent sighting, so "2 days ago" is the freshest evidence
    // rather than whichever engine happened to be checked first.
    if (check.checkedAt > entry.checkedAt) entry.checkedAt = check.checkedAt;
  }

  // Most engines first: a question three engines agree on is stronger evidence
  // than one a single engine mentioned, and belongs at the top either way.
  return [...map.values()].sort(
    (a, b) => b.engines.length - a.engines.length || b.checkedAt.localeCompare(a.checkedAt),
  );
}

/**
 * A cited URL, shortened to the part that identifies the page.
 *
 * The host is already the card's subject and every row repeats it, so the path
 * is the only distinguishing part. Tracking parameters go too — `?utm_source=openai`
 * is the engine's own tagging, not something the customer published.
 */
function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return path === '' ? parsed.hostname.replace(/^www\./, '') : path;
  } catch {
    return url;
  }
}

/** A grouped list of questions — the body of both new outcome cards. */
function QuestionList({ items }: { items: Grouped[] }) {
  return (
    <ul className="divide-line mt-3 divide-y">
      {items.map((item) => (
        <li key={item.question} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5">
          <p className="text-navy min-w-0 flex-1 text-[0.9375rem]">{item.question}</p>
          <p className="text-slate shrink-0 text-xs">
            {item.engines.join(' · ')} · {timeAgo(item.checkedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function TrackingWorkspace() {
  const { site, user, tracking, questions, coverQuestion, refreshTracking } = useDashboard();
  const run = useTrackingRun(
    site?.id,
    // ⚠️ Sent verbatim. The route stores these strings as the tracked prompt,
    // and the "draft into group" handler below matches a check back to its
    // discovered question by exact equality — trimming here would break the
    // loop that marks a question covered, silently.
    questions.map((q) => q.question),
    refreshTracking,
  );

  if (!site) {
    return (
      <>
        <PageHeader title="Results" description="Whether AI is actually citing you." />
        <EmptyState
          title="Add a site first"
          body="Citations are tracked per site, against that site's domain."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  if (!canTrack(user)) {
    return (
      <>
        <PageHeader title="Results" description="Whether AI is actually citing you." />
        <UpgradeCard
          entitlement="stay_cited"
          title="Stay Cited"
          body="Keeps every site on your account generating once its 30 days are up — new audits and unlimited answers. It also turns this page on: citation tracking puts your questions to ChatGPT, Perplexity and Gemini and records, for each one, whether they cited you, named you without a link, or pointed somewhere else."
        />
      </>
    );
  }

  const daily = tracking?.daily ?? [];
  const latest = tracking?.latest ?? [];

  /*
    Nothing checked yet.

    ⚠️ THIS IS "WE HAVE NOT LOOKED", NOT "NOBODY CITES YOU". `tracking` is null
    until a run has actually stored rows — see trackingFromDb() — precisely so
    this state can say the first thing rather than showing zeros that read as
    the second. Zeros here would be a measurement we never took.

    There is no scheduler yet, so the run is a button. When one lands this
    becomes the state a brand-new site sees for a day rather than the normal
    way to get data.
  */
  if (daily.length === 0) {
    return (
      <>
        <PageHeader title="Results" description={`What the engines say about ${site.name}.`} />
        {questions.length === 0 ? (
          <EmptyState
            title="Find some questions first"
            body="Tracking asks the engines your questions and records who they name. There are none on this site yet — find them on Opportunities and they become the things we watch."
            action={<ButtonLink href="/dashboard/questions">Find questions</ButtonLink>}
          />
        ) : (
          <EmptyState
            title="You haven’t run a check yet"
            body={`We’ll put your ${questions.length} ${questions.length === 1 ? 'question' : 'questions'} to ${ENGINES.join(', ')} and record, for each one, whether they cited you, named you without a link, or pointed somewhere else. It takes a minute or two.`}
            action={
              <Button onClick={run.run} disabled={run.busy}>
                {run.busy ? 'Checking…' : 'Run the first check'}
              </Button>
            }
          />
        )}

        {run.progress && run.busy && (
          <p className="text-slate mt-4 text-center text-sm">
            {run.progress.checked} checked, {run.progress.remaining} to go…
          </p>
        )}
        {run.error && (
          <p role="alert" className="text-error-ink mt-4 text-center text-sm">
            {run.error}
          </p>
        )}
        {run.notes.length > 0 && (
          <p className="text-slate mt-3 text-center text-xs">
            Some engines didn’t answer — {run.notes.join(' · ')}
          </p>
        )}
        {run.unreadable && (
          <p role="alert" className="text-error-ink mt-3 text-center text-xs">
            {run.unreadable}
          </p>
        )}
      </>
    );
  }

  const cited = latest.filter((c) => c.outcome === 'cited').length;
  const mentioned = latest.filter((c) => c.outcome === 'mentioned').length;
  const absent = latest.filter((c) => c.outcome === 'absent').length;

  /*
    Two different numbers that tools conflate, kept apart.

    A CITATION is being used as a source — the engine linked to you. A MENTION
    is being named at all, linked or not, so it INCLUDES the citations. Reading
    "mentions" as the unlinked half alone would make the two look like rivals
    when one contains the other, and a customer comparing our figure to another
    tool's needs to know which one they are holding.
  */
  const mentions = cited + mentioned;
  const visibilityRate = latest.length ? (mentions / latest.length) * 100 : 0;

  /*
    Share of voice: our source appearances against every source appearance.

    ⚠️ THE DENOMINATOR IS SOURCE SLOTS, NOT CHECKS. An answer citing six
    publishers offers six slots and we either hold one or we don't. This is the
    only figure here directly comparable between us and a rival, which is
    exactly why it must never be shown without the counts underneath it.
  */
  const appearances = tracking?.sourceAppearances ?? { ours: 0, total: 0 };
  const shareOfVoice = appearances.total ? (appearances.ours / appearances.total) * 100 : 0;

  const competitors = tracking?.competitors ?? [];
  const citedPages = tracking?.citedPages ?? [];
  const byEngine = tracking?.byEngine ?? [];

  /*
    The ranking, trimmed to a readable length.

    A real site draws on 200+ distinct domains, and a list that long is a data
    dump rather than a finding. Top twelve, plus OUR row appended at its true
    rank whenever we fall outside it — a share-of-voice board that can silently
    omit the reader is worse than no board, and "you: 47th" is precisely the
    fact they came for.
  */
  const SHARE_ROWS = 12;
  const ranked = competitors.map((c, i) => ({ ...c, rank: i + 1 }));
  const shareRows = ranked.slice(0, SHARE_ROWS);
  const you = ranked.find((c) => c.isYou);
  if (you && !shareRows.some((c) => c.isYou)) shareRows.push(you);

  // The meter divides by this, so it has to be the largest bar actually drawn.
  const shareTop = Math.max(...shareRows.map((c) => c.citations), 1);

  // Grouped for the two read-only lists below; `uncited` stays row-per-engine
  // because each of its rows names a different domain that took the click.
  const citedFor = groupByQuestion(latest.filter((c) => c.outcome === 'cited'));
  const namedFor = groupByQuestion(latest.filter((c) => c.outcome === 'mentioned'));

  const uncited = latest.filter((c) => c.outcome === 'absent');
  // The bar tracks prompts — the thing bought — not the checks they cost.
  const usedPct = tracking ? (tracking.promptsTracked / tracking.promptCap) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Results"
        description={`What ${ENGINES.join(', ')} say when asked about ${site.name}.`}
        action={
          <Button variant="ghost" size="sm" onClick={run.run} disabled={run.busy}>
            {run.busy ? 'Checking…' : 'Check now'}
          </Button>
        }
      />

      {/* ⚠️ Stated in the open, not in a footnote.

          We query each vendor's API — the OpenAI API with web search, Gemini
          with Google Search grounding — not chatgpt.com or gemini.google.com.
          Different system prompt, different retrieval, no personalisation. It
          is the closest honest proxy that can be measured, and calling it "what
          ChatGPT told your customer" would be exactly the overclaim this
          product stripped out of its own pricing page. */}
      <p className="text-slate mb-5 text-sm leading-relaxed">
        We ask each engine&rsquo;s API directly, so these are the answers a machine gets rather than
        a recording of anyone&rsquo;s chat window. Close to what a customer would see, not identical
        to it.
      </p>

      {(run.error || run.notes.length > 0 || run.unreadable || (run.busy && run.progress)) && (
        <div className="mb-5">
          {run.busy && run.progress && (
            <p className="text-slate text-sm">
              {run.progress.checked} checked, {run.progress.remaining} to go…
            </p>
          )}
          {run.error && (
            <p role="alert" className="text-error-ink text-sm">
              {run.error}
            </p>
          )}
          {run.notes.length > 0 && (
            <p className="text-slate mt-1 text-xs">
              Some engines didn&rsquo;t answer — {run.notes.join(' · ')}
            </p>
          )}
          {run.unreadable && (
            <p role="alert" className="text-error-ink mt-1 text-xs">
              {run.unreadable}
            </p>
          )}
        </div>
      )}

      {/* One card, four cells, hairline dividers — the same row the dashboard
          home uses. Four separate cards read as four competing things. */}
      <Card className="divide-line grid grid-cols-1 divide-y overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
        <MetricTile
          label="Citations"
          icon={<ChartIcon className="h-3.5 w-3.5" />}
          tint="bg-success/12 text-success-ink"
          value={cited}
          footer={`of ${latest.length} checks · you were the source`}
        />
        <MetricTile
          label="Mentions"
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          tint="bg-accent-soft text-teal-ink"
          value={mentions}
          footer={
            mentioned > 0
              ? `named at all · ${mentioned} without a link`
              : 'named at all, linked or not'
          }
        />
        <MetricTile
          label="Share of voice"
          icon={<AeoIcon className="h-3.5 w-3.5" />}
          tint="bg-primary-soft text-primary"
          value={`${shareOfVoice.toFixed(1)}%`}
          // The counts, always. A percentage of an unstated denominator is the
          // kind of figure this product strips out of its own marketing.
          footer={`${formatNumber(appearances.ours)} of ${formatNumber(appearances.total)} sources cited`}
        />
        <MetricTile
          label="Visibility rate"
          icon={<GlobeIcon className="h-3.5 w-3.5" />}
          value={`${visibilityRate.toFixed(0)}%`}
          footer={`of checks name you · ${absent} don’t`}
        />
      </Card>

      {/* Main column and rail.

          Ordered by whose question it answers: the chart and the two lists
          below it are about THIS business — is it working, and where is it
          nearly working. Share-of-voice is context about everyone else, so it
          comes last. The rail holds the two things you act on. */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-5">
          <CitationChart daily={daily} />

          {/* Per engine.

              The tiles above average the three together, which hides the most
              useful shape in the data: being cited on one engine and invisible
              on another is a different problem from being invisible everywhere,
              and it is fixable. Denominators are per engine and never assumed
              equal — a run where one engine 429s leaves it genuinely behind. */}
          {byEngine.some((e) => e.checked > 0) && (
            <Card className="p-5 sm:p-7">
              <SectionTitle>By engine</SectionTitle>
              <p className="text-slate mt-1 text-sm">
                Where you stand on each one, from the most recent check of every question.
              </p>

              <ul className="divide-line mt-3 divide-y">
                {byEngine.map((e) => (
                  <li key={e.engine} className="py-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-navy text-sm font-semibold">{e.engine}</p>
                      <p className="text-slate text-xs">
                        {e.checked === 0 ? (
                          // Not a zero — a gap. Saying "0 citations" for an
                          // engine we never heard from would be a measurement
                          // we did not take.
                          <span className="text-error-ink">no answers stored</span>
                        ) : (
                          <>
                            <span className="text-success-ink font-semibold">{e.cited} cited</span>
                            {e.mentioned > 0 && <> · {e.mentioned} named</>} · {e.absent} absent ·
                            of {e.checked}
                          </>
                        )}
                      </p>
                    </div>
                    {e.checked > 0 && (
                      <Meter
                        className="mt-1.5"
                        value={((e.cited + e.mentioned) / e.checked) * 100}
                        tone={e.cited > 0 ? 'primary' : 'line'}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* The positive half, which until now existed only as a number in a
              tile. This is the screen a subscriber opens to answer "is this
              working", and a count alone cannot answer it. */}
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>You&rsquo;re cited for</SectionTitle>
              <Badge tone="success">{citedFor.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              Questions where an engine used your site as a source and linked to you.
            </p>

            {citedFor.length === 0 ? (
              // Not a blank. On a site that has run checks this is a finding.
              <p className="text-slate mt-4 text-sm">
                Nothing yet. Publishing answers to the questions below is what changes this —
                an engine can only cite text it can read on your own domain.
              </p>
            ) : (
              <QuestionList items={citedFor} />
            )}
          </Card>

          {/* The sharpest finding in the set, and the one that was hardest to
              act on while it was a bare count: the engine knows who you are
              and still sent the click somewhere else. */}
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Named, but not linked</SectionTitle>
              <Badge tone="cyan">{namedFor.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              An engine named {site.name} in its answer without citing you as the source. It knows
              who you are — it just sent the click elsewhere.
            </p>

            {namedFor.length === 0 ? (
              <p className="text-slate mt-4 text-sm">
                Nothing here. Every mention we found was linked.
              </p>
            ) : (
              <>
                <QuestionList items={namedFor} />
                <p className="text-slate mt-4 text-sm leading-relaxed">
                  Usually this means the answer isn&rsquo;t on a page the engine can point at.
                  Check that the block covering these questions is pasted and current on{' '}
                  <Link
                    href="/dashboard/publish"
                    className="text-primary hover:text-primary-hover font-semibold"
                  >
                    your published pages
                  </Link>
                  .
                </p>
              </>
            )}
          </Card>

          {/* Which of our own pages earned the citations.

              The actionable half. "You were cited five times" is a score; "this
              page was cited five times" is an instruction — it says which piece
              of content is doing the work and therefore what to write more of.
              Costs nothing to show: the full URLs were already stored on every
              check. */}
          {citedPages.length > 0 && (
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle>Pages earning citations</SectionTitle>
                <Badge tone="success">{citedPages.length}</Badge>
              </div>
              <p className="text-slate mt-1 text-sm">
                The exact URLs engines linked to. More citations than checks is normal — one
                answer can cite two of your pages.
              </p>

              <ul className="divide-line mt-3 divide-y">
                {citedPages.map((page) => (
                  <li
                    key={page.url}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5"
                  >
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:text-primary-hover min-w-0 flex-1 truncate text-sm"
                    >
                      {prettyUrl(page.url)}
                    </a>
                    <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                      {page.citations}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Share of voice.

              ⚠️ COUNTS EVERY SOURCE IN EVERY ANSWER, not one per check. That is
              the difference between ranking against the handful of rivals who
              happened to take first place and ranking against the whole field
              the engines actually drew from. */}
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Who gets cited</SectionTitle>
              <Badge tone="cyan">{formatNumber(competitors.length)} domains</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              Every source the engines used across {site.name}&rsquo;s questions —{' '}
              {formatNumber(appearances.total)} citations in all, ranked by how often each domain
              was drawn on.
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
                and {formatNumber(competitors.length - shareRows.length)} more domains cited at
                least once.
              </p>
            )}
          </Card>
        </div>

        <div className="mt-5 space-y-5 lg:mt-0">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Not cited for</SectionTitle>
              <Badge tone="cyan">{uncited.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              Questions where an engine named someone else. This is the loop closing — each one is
              the next answer to write.
            </p>

            {uncited.length === 0 ? (
              <p className="text-slate mt-4 text-sm">
                You were cited or named on every question we checked.
              </p>
            ) : (
              <ul className="divide-line mt-3 divide-y">
                {uncited.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-navy text-sm">{c.question}</p>
                      <p className="text-slate mt-0.5 text-xs">
                        {c.engine} cited{' '}
                        <span className="font-mono">{c.citedInstead ?? 'nobody'}</span> ·{' '}
                        {timeAgo(c.checkedAt)}
                      </p>
                    </div>
                    <DraftIntoGroup
                      question={c.question}
                      onDrafted={async () => {
                        const match = questions.find((q) => q.question === c.question);
                        if (match) await coverQuestion(match.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

        {/* The budget, in the unit that's actually bought.

            Prompts lead; engine checks are the cost of them and sit underneath.
            "300 checks" tells a solo marketer nothing about how many questions
            they can watch — they'd have to divide by engines and frequency
            themselves. Note there is no page count anywhere near this: pages
            are scanned, prompts are asked, and the two never derive from each
            other. */}
        {tracking && (
          <Card tone="cloud" className="p-5">
            <div className="min-w-0">
              <div className="min-w-0">
                <p className="text-navy text-sm font-semibold">
                  {formatNumber(tracking.promptsTracked)} of {formatNumber(tracking.promptCap)}{' '}
                  prompts tracked
                </p>
                <p className="text-slate mt-0.5 text-xs">
                  {formatNumber(tracking.checksUsed)} of{' '}
                  {formatNumber(
                    engineChecksFor(tracking.promptCap, ENGINES.length, tracking.runsPerPeriod),
                  )}{' '}
                  engine checks this period · each prompt is asked {ENGINES.length} engines ×{' '}
                  {tracking.runsPerPeriod} times · resets {timeUntil(tracking.periodResetsAt)}
                </p>
              </div>
              <Meter className="mt-3" value={usedPct} />
            </div>
          </Card>
        )}
        </div>
      </div>

      <p className="text-slate mt-6 text-center text-xs">
        Engines checked: {ENGINES.join(' · ')}
      </p>
    </>
  );
}
