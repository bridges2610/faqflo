'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { pillarBand, scoreOf } from '@/lib/audit/score';
import { visibilityFindings } from '@/lib/dashboard/audit-context';
import { useDashboard } from '@/lib/dashboard/provider';
import { discoverQuestions } from '@/lib/dashboard/discover';
import {
  canTrack,
  DISCOVERED_PROMPT_CAP,
  engineChecksFor,
  MANUAL_QUESTION_CAP,
  STAY_CITED_PROMPT_CAP,
} from '@/lib/dashboard/plans';
import { formatNumber, timeAgo, timeUntil } from '@/lib/dashboard/format';
import {
  ENGINES,
  MAX_EXCERPT_CHARS,
  type CitationCheck,
  type SiteTracking,
} from '@/lib/dashboard/types';
import { AnswerText } from './answer-text';
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

  ⚠️ THE CLIENT LOOPS BECAUSE THE SERVER CANNOT. A full period is 35 prompts
  against three search-backed engines; the route runs a bounded slice per
  request because this app holds itself to roughly the platform's ~60s ceiling
  and there is no queue in this project. So the button posts repeatedly until
  the route reports nothing left, and shows how far it has got.

  ⚠️ The pass bound below is what caps that loop, and it is not arbitrary: at
  PROMPTS_PER_RUN (5) a full 35-prompt set needs 7 passes, so 12 leaves room and
  still stops a route that kept claiming work remaining from billing until the
  tab closed. Raising the prompt cap past 60 would need this raised with it.

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

/**
 * A source URL as it should be read: host and path, no query string.
 *
 * Keeps the host, unlike prettyUrl below — a source list names other people's
 * sites, so the domain is the most important part of the line.
 */
function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return url;
  }
}

/**
 * Does this excerpt end mid-thought?
 *
 * A cheap heuristic, and deliberately so: it decides whether to print a caveat,
 * never what the data means. Answers stored before the word-boundary cut landed
 * simply stop at 600 characters, and there is no flag on the row to consult.
 */
function looksTruncated(excerpt: string): boolean {
  const end = excerpt.trimEnd().slice(-1);
  return excerpt.length >= MAX_EXCERPT_CHARS - 1 && !'.!?"”)'.includes(end);
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

/**
 * One row of evidence: what was asked, what came back, and who got the link.
 *
 * ⚠️ THE ANSWER TEXT IS THE POINT. Every other surface in this product reports
 * an outcome; this is the only one that shows the thing the outcome was read
 * from. `answer_excerpt` has been stored since the first run — 0006 says why in
 * as many words — and until now nothing displayed it, so "you were not cited"
 * arrived with no way to check it. Collapsed by default because forty open
 * answers is not a report; one click away because disbelief is the normal
 * reaction to a bad number and it deserves an answer.
 */
function EvidenceRow({
  check,
  action,
}: {
  check: CitationCheck;
  action?: React.ReactNode;
}) {
  const tone =
    check.outcome === 'cited' ? 'success' : check.outcome === 'mentioned' ? 'cyan' : undefined;
  const label =
    check.outcome === 'cited' ? 'Cited' : check.outcome === 'mentioned' ? 'Named' : 'Absent';

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-navy text-[0.9375rem]">{check.question}</p>
          <p className="text-slate mt-1 text-xs">
            {check.engine} · {timeAgo(check.checkedAt)}
            {check.sources.length > 0 && (
              <> · {check.sources.length} {check.sources.length === 1 ? 'source' : 'sources'}</>
            )}
            {check.outcome !== 'cited' && check.citedInstead && (
              <>
                {' '}
                · cited <span className="font-mono">{check.citedInstead}</span> instead
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {tone ? <Badge tone={tone}>{label}</Badge> : <Badge>{label}</Badge>}
          {action}
        </div>
      </div>

      {/* <details> rather than a state hook: forty rows would be forty pieces of
          state to no benefit, and the browser already knows how to do this. */}
      <details className="group mt-2">
        <summary className="text-primary hover:text-primary-hover cursor-pointer list-none text-xs font-semibold">
          <span className="group-open:hidden">View the answer</span>
          <span className="hidden group-open:inline">Hide the answer</span>
        </summary>

        {check.excerpt ? (
          <div className="border-line mt-2 border-l-2 pl-3">
            <AnswerText text={check.excerpt} />
            {looksTruncated(check.excerpt) && (
              // Rows stored before the clean cut landed end mid-word, and the
              // rest of the answer was never kept — so it cannot be repaired,
              // only labelled. Without this the engine looks like it stopped
              // talking mid-sentence.
              <p className="text-slate/70 mt-1.5 text-xs">
                Excerpt — we store the first {MAX_EXCERPT_CHARS} characters of each answer.
              </p>
            )}
          </div>
        ) : (
          // Older rows predate the excerpt being stored. Say that, rather than
          // rendering an empty quote that reads as an engine saying nothing.
          <p className="text-slate mt-2 text-sm italic">
            No answer text was stored for this check.
          </p>
        )}

        {check.sources.length > 0 && (
          <ul className="mt-3 space-y-1">
            {check.sources.map((url) => (
              <li key={url} className="min-w-0 truncate">
                {/* Display is cleaned; the href is the stored URL, untouched.
                    `?utm_source=openai` is the engine tagging its own referral
                    and makes two links to one page look like two pages — but
                    the source list is evidence, so what we LINK to stays
                    exactly what was recorded. */}
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate hover:text-primary font-mono text-xs"
                >
                  {displayUrl(url)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

type OutcomeFilter = 'all' | 'cited' | 'mentioned' | 'absent';

const FILTERS: { id: OutcomeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cited', label: 'Cited' },
  { id: 'mentioned', label: 'Named' },
  { id: 'absent', label: 'Absent' },
];

/** Rows per page. Forty answers at once is a data dump, not a report. */
const PAGE = 12;

/**
 * A change since the last run, or nothing at all.
 *
 * ⚠️ NOTHING, not "0%" and not "—". A placeholder in the shape of a statistic
 * gets read as one; an absent delta reads as "no trend yet", which is the true
 * state of a site that has run checks once.
 */
function deltaLabel(delta: number | null): string {
  if (delta === null) return '';
  const rounded = Math.round(delta);
  if (rounded === 0) return ' · no change since the last run';
  return ` · ${rounded > 0 ? '+' : ''}${rounded}% since the last run`;
}

/**
 * Topping the watch list up, from the page that shows what it is worth.
 *
 * Lives here rather than only on Opportunities because this is where a customer
 * learns their coverage is thin — they see fifteen questions answered and a
 * rival cited on most of them. Sending them to another screen to act on that is
 * where the thought gets lost.
 *
 * ⚠️ APPENDS, unlike the Opportunities button, and passes the current questions
 * as exclusions. Without the exclusions the model returns much the same list and
 * every one is discarded as a duplicate — the request would cost a full Opus
 * call to add nothing.
 */
function useFindMore(): {
  find: () => Promise<void>;
  busy: boolean;
  error: string | null;
  added: number | null;
  room: number;
  hasPages: boolean;
} {
  const { site, questions, faqs, addQuestions, recheckCoverage } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  const mine = site ? questions.filter((q) => q.siteId === site.id) : [];
  /*
    Against the DISCOVERY ceiling, not the plan total.

    Filling to the total is what killed the manual field: one press took every
    slot and "Add your own question" became "your watch list is full" forever.
    The manual reserve is held back whether or not it has been used.
  */
  const discovered = mine.filter((q) => q.source !== 'manual').length;
  const room = Math.max(0, DISCOVERED_PROMPT_CAP - discovered);
  const hasPages = (site?.lastAudit?.pages?.length ?? 0) > 0;

  async function find() {
    if (!site || room === 0 || busy) return;

    setBusy(true);
    setError(null);
    setAdded(null);

    try {
      const result = await discoverQuestions({
        site,
        faqs,
        exclude: mine.map((q) => q.question),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const before = discovered;
      await addQuestions(site.id, result.questions, 'append');
      await recheckCoverage(site.id);

      /*
        Report what actually landed, not what the model returned. Duplicates are
        dropped and the cap truncates, so "found 15" after adding 4 would be a
        number the customer can see is wrong the moment they count the list.
        Computed from the cap rather than re-reading state, which has not
        re-rendered yet.
      */
      setAdded(Math.min(result.questions.length, room, DISCOVERED_PROMPT_CAP - before));
    } finally {
      setBusy(false);
    }
  }

  return { find, busy, error, added, room, hasPages };
}

/**
 * Typing your own question onto the watch list.
 *
 * The model writes good questions about a category; it cannot know the one a
 * customer's phone actually rings about, or the rival they want to be compared
 * against. Ten of these, inside the same 25 the plan buys.
 *
 * Every refusal is a separate sentence. The store returns WHICH rule stopped
 * the add precisely so this can say it — one "couldn't add that" covering four
 * causes is what makes someone press the button again unchanged.
 */
function useManualQuestion(): {
  add: (text: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  used: number;
  room: number;
  clearError: () => void;
} {
  const { site, questions, addManualQuestion } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = site ? questions.filter((q) => q.siteId === site.id) : [];
  const used = mine.filter((q) => q.source === 'manual').length;
  const room = Math.min(
    MANUAL_QUESTION_CAP - used,
    Math.max(0, STAY_CITED_PROMPT_CAP - mine.length),
  );

  async function add(text: string): Promise<boolean> {
    if (!site || busy) return false;

    setBusy(true);
    setError(null);

    try {
      const result = await addManualQuestion(site.id, text);
      if (result.ok) return true;

      setError(
        {
          empty: 'Type a question first.',
          'too-long': 'That is too long for a prompt — trim it to a single question.',
          duplicate: 'You are already watching that question.',
          'manual-cap': `You can add ${MANUAL_QUESTION_CAP} of your own. Remove one on Opportunities to make room.`,
          'prompt-cap': `Your watch list is full at ${STAY_CITED_PROMPT_CAP} prompts.`,
        }[result.reason],
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { add, busy, error, used, room, clearError: () => setError(null) };
}

export function TrackingWorkspace() {
  const { site, user, tracking, questions, coverQuestion, refreshTracking } = useDashboard();
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const more = useFindMore();
  const manual = useManualQuestion();
  const [draft, setDraft] = useState('');
  const [justAdded, setJustAdded] = useState(false);
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
  /*
    The headline number, and NOT a new one.

    Competing tools lead with an opaque 0-100. We already have a scored AI
    visibility pillar — visibilityFindings() turns these very checks into three
    weighted findings and scoreOf() weighs them — so this reuses that rather
    than inventing a second scoring system that would disagree with the audit's.
    The findings render underneath as the explanation, which is the part a bare
    score cannot give you.

    ⚠️ `null` means locked or not yet measured. It must never render as 0: a
    zero says "we looked and found nothing", and we did not look.
  */
  const visibility = visibilityFindings(user, tracking);
  const visibilityScore = scoreOf(visibility);
  const band = pillarBand(visibilityScore);

  const appearances = tracking?.sourceAppearances ?? { ours: 0, total: 0 };
  const shareOfVoice = appearances.total ? (appearances.ours / appearances.total) * 100 : 0;

  /*
    Change since the previous run-day.

    ⚠️ ONLY WHEN THERE ARE TWO RUN-DAYS. Competing tools print a delta beside
    every metric permanently; with a single day of data any such figure is
    derived from one point and means nothing. `null` here renders as no delta at
    all — not a zero, not a dash, nothing — because the honest statement is that
    there is no trend yet.

    Days with no run are absent from `daily` rather than zero-filled, so "the
    previous entry" is the previous time we actually looked.
  */
  const previousDay = daily.length >= 2 ? daily[daily.length - 2] : null;
  const latestDay = daily.length >= 2 ? daily[daily.length - 1] : null;

  const deltaOf = (now: number, before: number): number | null => {
    if (!latestDay || !previousDay) return null;
    if (before === 0) return now === 0 ? 0 : null; // no baseline to divide by
    return ((now - before) / before) * 100;
  };

  const citedDelta = latestDay && previousDay ? deltaOf(latestDay.cited, previousDay.cited) : null;
  const mentionsDelta =
    latestDay && previousDay
      ? deltaOf(latestDay.cited + latestDay.mentioned, previousDay.cited + previousDay.mentioned)
      : null;

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

  /*
    The evidence table's filter.

    Row-per-engine rather than grouped by question: each row carries its own
    answer text, its own source list and its own `citedInstead`, and those are
    the things being examined. Grouping would have to throw two of the three
    away to merge them.
  */
  const countFor = (id: OutcomeFilter) =>
    id === 'all' ? latest.length : latest.filter((c) => c.outcome === id).length;

  const filtered =
    filter === 'all' ? latest : latest.filter((c) => c.outcome === filter);
  const visible = filtered.slice(0, shown);
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

      {/* The score, with its own reasoning attached.

          A number on its own invites the question "based on what?" and answers
          nothing. These three findings ARE the score — same weights, same
          arithmetic — so the card explains itself rather than asking for
          trust. */}
      {visibilityScore !== null && (
        <Card className="mb-5 p-5 sm:p-7">
          <div className="sm:flex sm:items-start sm:gap-7">
            <div className="shrink-0">
              <p className="text-slate text-xs font-semibold tracking-wide uppercase">
                AI visibility
              </p>
              <p className="text-navy mt-1 text-4xl font-semibold tabular-nums">
                {visibilityScore}
                <span className="text-slate text-lg font-normal">/100</span>
              </p>
              <Badge
                tone={band === 'good' ? 'success' : band === 'mixed' ? 'cyan' : undefined}
                className="mt-2"
              >
                {band === 'good' ? 'Strong' : band === 'mixed' ? 'Mixed' : 'Low'}
              </Badge>
            </div>

            <ul className="divide-line mt-5 flex-1 divide-y sm:mt-0">
              {visibility.map((f) => (
                <li key={f.id} className="py-2.5 first:pt-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        f.status === 'pass'
                          ? 'bg-success'
                          : f.status === 'warn'
                            ? 'bg-accent'
                            : 'bg-error-ink'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-navy text-sm font-semibold">{f.label}</p>
                      <p className="text-slate mt-0.5 text-sm leading-relaxed">{f.detail}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* One card, four cells, hairline dividers — the same row the dashboard
          home uses. Four separate cards read as four competing things. */}
      <Card className="divide-line grid grid-cols-1 divide-y overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
        <MetricTile
          label="Citations"
          icon={<ChartIcon className="h-3.5 w-3.5" />}
          tint="bg-success/12 text-success-ink"
          value={cited}
          footer={`of ${latest.length} checks${deltaLabel(citedDelta)} · you were the source`}
        />
        <MetricTile
          label="Mentions"
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          tint="bg-accent-soft text-teal-ink"
          value={mentions}
          footer={
            mentioned > 0
              ? `named at all${deltaLabel(mentionsDelta)} · ${mentioned} without a link`
              : `named at all, linked or not${deltaLabel(mentionsDelta)}`
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
                            <span className="text-success-ink font-semibold">
                              {(((e.cited + e.mentioned) / e.checked) * 100).toFixed(0)}%
                            </span>{' '}
                            name you · {e.cited} cited
                            {e.mentioned > 0 && <> · {e.mentioned} named</>} · of {e.checked}
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

          {/* Every check, filterable — one table instead of three cards.

              ⚠️ THREE CARDS SPLIT THE EVIDENCE BY ANSWER, WHICH IS THE ONE WAY
              IT SHOULD NOT BE SPLIT. "Cited for", "Named but not linked" and
              "Not cited for" were three lists of the same rows sliced by
              outcome, so comparing them meant scrolling between cards, and
              nothing showed what the engine had actually said. A filter does
              the slicing without hiding the whole from you. */}
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>Every answer we checked</SectionTitle>
              <Badge tone="cyan">{latest.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              One row per question per engine, newest first. Open any of them to read what the
              engine actually said and which sources it used.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const count = countFor(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filter === f.id
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-slate hover:text-navy'
                    }`}
                  >
                    {f.label} {count}
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <p className="text-slate mt-4 text-sm">
                {filter === 'cited'
                  ? 'No engine has cited you yet on the questions we watch. Publishing answers is what changes this — an engine can only cite text it can read on your own domain.'
                  : filter === 'mentioned'
                    ? 'Nothing here. Every mention we found was linked.'
                    : 'Nothing in this view.'}
              </p>
            ) : (
              <ul className="divide-line mt-2 divide-y">
                {visible.map((c) => (
                  <EvidenceRow
                    key={c.id}
                    check={c}
                    action={
                      // The loop closing, preserved from the old "Not cited for"
                      // card: see you weren't cited, write the answer, the
                      // question stops being open. Only offered where there is
                      // something to fix.
                      c.outcome !== 'cited' ? (
                        <DraftIntoGroup
                          question={c.question}
                          onDrafted={async () => {
                            const match = questions.find((q) => q.question === c.question);
                            if (match) await coverQuestion(match.id);
                          }}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}

            {visible.length > 0 && shown < filtered.length && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="text-primary hover:text-primary-hover mt-4 text-sm font-semibold"
              >
                Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length}
              </button>
            )}

            {mentioned > 0 && (
              <p className="text-slate mt-4 text-sm leading-relaxed">
                Named but not linked usually means the answer isn&rsquo;t on a page the engine can
                point at. Check that the block covering those questions is pasted and current on{' '}
                <Link
                  href="/dashboard/publish"
                  className="text-primary hover:text-primary-hover font-semibold"
                >
                  your published pages
                </Link>
                .
              </p>
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
          {/* The old "Not cited for" card stood here. Its rows and its
              "Draft into group" action both live in the evidence table now —
              beside the answer text that explains why they are on the list,
              which the rail was too narrow to ever show. */}

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

              {/* Widening the sample, from the screen that shows why you'd want
                  to. Every state below is a different answer to "can I have
                  more?", and none of them is a disabled button with no reason
                  given. */}
              <div className="border-line mt-4 border-t pt-4">
                {more.room === 0 ? (
                  // ⚠️ "Discovery is full", NOT "your watch list is full". With
                  // 25 discovered and no manual questions there are still ten
                  // slots left, and calling that full would be untrue — and
                  // would send someone to delete a question they didn't need to.
                  <p className="text-slate text-xs">
                    We&rsquo;ve found the {formatNumber(DISCOVERED_PROMPT_CAP)} questions this
                    plan looks for. You can still add{' '}
                    {formatNumber(MANUAL_QUESTION_CAP)} of your own below, or retire one on{' '}
                    <Link
                      href="/dashboard/questions"
                      className="text-primary hover:text-primary-hover font-semibold"
                    >
                      Opportunities
                    </Link>{' '}
                    to look again.
                  </p>
                ) : !more.hasPages ? (
                  // The route rejects an empty page list, so say why here
                  // rather than spending a round trip to be told.
                  <p className="text-slate text-xs">
                    Run a full check of your site first — finding more questions means reading your
                    pages.
                  </p>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={more.find}
                      disabled={more.busy}
                      className="w-full"
                    >
                      {more.busy ? 'Looking…' : `Find ${more.room} more questions`}
                    </Button>
                    <p className="text-slate mt-2 text-xs">
                      Asks for questions you aren&rsquo;t already watching. They join the list
                      straight away and are checked on your next run.
                    </p>
                  </>
                )}

                {more.error && (
                  <p role="alert" className="text-error-ink mt-2 text-xs">
                    {more.error}
                  </p>
                )}

                {more.added !== null && !more.error && (
                  <p className="text-slate mt-2 text-xs">
                    {more.added === 0
                      ? // Not a failure: every suggestion was one we already watch.
                        'Nothing new came back — the questions found were ones you already track.'
                      : `Added ${more.added}. They have no results yet — run a check to ask the engines.`}
                  </p>
                )}
              </div>

              {/* Your own question.

                  The model writes good questions about a trade; it cannot know
                  the one this business is actually asked, or the competitor
                  they want to be compared against. Sits under "Find more"
                  because both grow the same list — one by asking a model, one
                  by asking the person who runs the company. */}
              <div className="border-line mt-4 border-t pt-4">
                <p className="text-navy text-sm font-semibold">Add your own question</p>

                {manual.room === 0 ? (
                  <p className="text-slate mt-1 text-xs">
                    {manual.used >= MANUAL_QUESTION_CAP
                      ? `You've added all ${MANUAL_QUESTION_CAP} of your own. Remove one on `
                      : `Your watch list is full at ${formatNumber(STAY_CITED_PROMPT_CAP)} prompts. Make room on `}
                    <Link
                      href="/dashboard/questions"
                      className="text-primary hover:text-primary-hover font-semibold"
                    >
                      Opportunities
                    </Link>
                    .
                  </p>
                ) : (
                  <form
                    className="mt-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await manual.add(draft);
                      if (ok) {
                        setDraft('');
                        setJustAdded(true);
                      }
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        // Clear the last refusal as soon as they change the
                        // input — leaving it up makes a fixed question look
                        // like it is still being rejected.
                        if (manual.error) manual.clearError();
                        if (justAdded) setJustAdded(false);
                      }}
                      placeholder="Who is the best roofer in Nyack?"
                      aria-label="Add your own question to the watch list"
                      className="border-line focus:border-primary text-navy placeholder:text-slate/70 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-slate text-xs">
                        {manual.used} of {MANUAL_QUESTION_CAP} of your own
                      </p>
                      <Button type="submit" variant="ghost" size="sm" disabled={manual.busy}>
                        {manual.busy ? 'Adding…' : 'Add'}
                      </Button>
                    </div>
                  </form>
                )}

                {manual.error && (
                  <p role="alert" className="text-error-ink mt-2 text-xs">
                    {manual.error}
                  </p>
                )}

                {justAdded && !manual.error && (
                  <p className="text-slate mt-2 text-xs">
                    Added. It has no results yet — run a check to ask the engines.
                  </p>
                )}
              </div>
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
