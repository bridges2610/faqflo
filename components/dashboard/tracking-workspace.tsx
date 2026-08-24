'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { pillarBand, scoreOf } from '@/lib/audit/score';
import { visibilityFindings } from '@/lib/dashboard/audit-context';
import { useDashboard, type TrackingRun } from '@/lib/dashboard/provider';
import { discoverQuestions } from '@/lib/dashboard/discover';
import { canRunCheckNow, isPro, trackingPlanFor } from '@/lib/dashboard/plans';
import { formatNumber, timeAgo, timeUntil } from '@/lib/dashboard/format';
import {
  ENGINES,
  MAX_EXCERPT_CHARS,
  type CitationCheck,
  type Engine,
  type SiteTracking,
} from '@/lib/dashboard/types';
import { AnswerText } from './answer-text';
import { CitationChart } from './citation-chart';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { MetricTile } from './metric-tile';
import { Meter } from './meter';
import { RunProgress } from './run-progress';
import { countryLabel } from './search-country';
import { AeoIcon, ChartIcon, ChevronIcon, GlobeIcon, SearchIcon } from './nav-icons';
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


/** Every check we hold for one question, in ENGINES order. */
type QuestionGroup = {
  question: string;
  checks: CitationCheck[];
  /** Most recent sighting across the group — what "2 days ago" should mean. */
  checkedAt: string;
  sources: number;
};

/**
 * One question, and what each engine said about it.
 *
 * ⚠️ GROUPED, BUT NOTHING IS MERGED. The row-per-engine layout this replaces was
 * deliberate: each check carries its own answer, its own source list and its own
 * `citedInstead`, and a summary row that flattened them would throw two of the
 * three away. So the group is a container, never a summary — the badges name
 * each engine separately, and the expansion keeps all three answers whole and
 * apart. Flatten any of that and the original objection is right again.
 *
 * The comparison is the reason three engines get asked at all: being cited by
 * Perplexity and absent from ChatGPT on the same question is one finding, and it
 * was previously spread across three rows a customer had to hunt for.
 */
function QuestionRow({ group, action }: { group: QuestionGroup; action?: React.ReactNode }) {
  const byEngine = ENGINES.map((engine) => ({
    engine,
    check: group.checks.find((c) => c.engine === engine) ?? null,
  }));

  // Who took the click, from the first engine that named someone else. One
  // rival stands for the group; the per-engine detail is in the expansion.
  const instead = group.checks.find((c) => c.outcome !== 'cited' && c.citedInstead)?.citedInstead;

  return (
    <li className="py-4">
      <details className="group">
        <summary className="cursor-pointer list-none">
          {/* Read down the left column: what was asked, what each engine said,
              then the context. The action sits right so it never interrupts
              that order. */}
          <div className="flex items-start gap-3">
            <ChevronIcon
              className="text-slate group-hover:text-navy mt-1 h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90"
            />

            <div className="min-w-0 flex-1">
              <p className="text-navy text-[0.9375rem] leading-snug">{group.question}</p>

              {/* The comparison, without opening anything. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {byEngine.map(({ engine, check }) => (
                  <EnginePill key={engine} engine={engine} check={check} />
                ))}
              </div>

              <p className="text-slate mt-1.5 text-xs">
                {timeAgo(group.checkedAt)}
                {group.sources > 0 && (
                  <>
                    {' '}
                    · {group.sources} {group.sources === 1 ? 'source' : 'sources'}
                  </>
                )}
                {instead && (
                  <>
                    {' '}
                    · cited <span className="font-mono">{instead}</span> instead
                  </>
                )}
              </p>
            </div>

            {action && <div className="shrink-0">{action}</div>}
          </div>
        </summary>

        <div className="divide-line mt-3 divide-y">
          {byEngine.map(({ engine, check }) => (
            <div key={engine} className="py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* The engine is named once here; the chip carries only the
                    verdict. The summary pill has to say both because it stands
                    alone. */}
                <p className="text-navy text-xs font-semibold">{engine}</p>
                <OutcomeChip check={check} />
                {check && check.sources.length > 0 && (
                  <p className="text-slate text-xs">
                    {check.sources.length} {check.sources.length === 1 ? 'source' : 'sources'}
                  </p>
                )}
                {check && check.outcome !== 'cited' && check.citedInstead && (
                  <p className="text-slate text-xs">
                    cited <span className="font-mono">{check.citedInstead}</span> instead
                  </p>
                )}
              </div>

              {!check ? (
                /* ⚠️ A gap, not a zero. An engine can fail on its own — a 429
                   during the run — and rendering "absent" here would claim a
                   measurement we never took. */
                <p className="text-slate mt-1.5 text-sm italic">
                  Not checked on this engine yet.
                </p>
              ) : check.excerpt ? (
                <div className="border-line mt-1.5 border-l-2 pl-3">
                  <AnswerText text={check.excerpt} />
                  {looksTruncated(check.excerpt) && (
                    <p className="text-slate/70 mt-1.5 text-xs">
                      Excerpt — we store the first {MAX_EXCERPT_CHARS} characters of each answer.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate mt-1.5 text-sm italic">
                  No answer text was stored for this check.
                </p>
              )}

              {check && check.sources.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {check.sources.map((url) => (
                    <li key={url} className="min-w-0 truncate">
                      {/* Display is cleaned; the href is the stored URL,
                          untouched. `?utm_source=openai` is the engine tagging
                          its own referral and makes two links to one page look
                          like two — but the source list is evidence, so what we
                          LINK to stays exactly what was recorded. */}
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
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

/**
 * The outcome words and their tints, shared by the pill and the chip.
 *
 * ⚠️ THE WORD IS NOT DECORATION. Colour alone must never carry this: `cited`
 * and `absent` are separated by a tint some readers cannot distinguish, and it
 * is the figure the customer acts on. The tint is a second encoding of a label
 * that is already readable — the same rule components/dashboard/meter.tsx
 * states for its bars.
 */
const OUTCOME_STYLE: Record<CitationCheck['outcome'], { label: string; className: string }> = {
  cited: { label: 'cited', className: 'bg-success/12 text-success-ink' },
  mentioned: { label: 'named', className: 'bg-accent-soft text-navy' },
  absent: { label: 'absent', className: 'text-slate border-line border bg-white' },
};

/** Not an outcome — the absence of one. Kept visually quieter than any verdict. */
const NOT_CHECKED = { label: 'not checked', className: 'text-slate/80 border-line border bg-white' };

/**
 * One engine's verdict on one question, at a glance.
 *
 * ⚠️ ITS OWN COMPONENT RATHER THAN A SMALLER <Badge>. Badge hardcodes
 * `px-3 py-1 text-[0.8125rem]` and emits its tone classes BEFORE `className`,
 * so passing `px-2 text-xs` would not reliably win — conflicting Tailwind
 * utilities resolve by their order in the generated stylesheet, not by their
 * order in the class attribute. A pill that is smaller only sometimes is worse
 * than one that owns its own size, and shrinking Badge would shrink it on every
 * other screen too.
 *
 * Three of these sit under every question, so they are deliberately quiet: the
 * question is what you read, these are what you scan.
 */
function EnginePill({ engine, check }: { engine: Engine; check: CitationCheck | null }) {
  const { label, className } = check ? OUTCOME_STYLE[check.outcome] : NOT_CHECKED;

  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] leading-none font-medium ${className}`}
    >
      <span className="font-semibold">{engine}</span>
      {label}
    </span>
  );
}

/** The same verdict, inside an open row where the engine is already named. */
function OutcomeChip({ check }: { check: CitationCheck | null }) {
  const { label, className } = check ? OUTCOME_STYLE[check.outcome] : NOT_CHECKED;

  return (
    <span
      className={`rounded-pill inline-flex items-center px-2 py-0.5 text-[0.6875rem] leading-none font-medium ${className}`}
    >
      {label}
    </span>
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
  const { site, user, questions, faqs, addQuestions, recheckCoverage } = useDashboard();
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
  /* The plan's ceiling, not a global: free proposes 5 and Pro 15. */
  const caps = trackingPlanFor(user);
  const room = Math.max(0, caps.discoveredCap - discovered);
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
      setAdded(Math.min(result.questions.length, room, caps.discoveredCap - before));
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
  const { site, user, questions, addManualQuestion } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = site ? questions.filter((q) => q.siteId === site.id) : [];
  const used = mine.filter((q) => q.source === 'manual').length;
  const caps = trackingPlanFor(user);
  const room = Math.min(caps.manualCap - used, Math.max(0, caps.promptCap - mine.length));

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
          'manual-cap': `You can add ${caps.manualCap} of your own. Remove one on Opportunities to make room.`,
          'prompt-cap': `Your watch list is full at ${caps.promptCap} prompts.`,
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
  const { site, user, tracking, questions, coverQuestion, trackingRun, runTracking } =
    useDashboard();
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const more = useFindMore();
  const manual = useManualQuestion();
  const [draft, setDraft] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  /*
    The run belongs to the provider, not this page.

    It used to be a hook here, so navigating away unmounted it and the run
    appeared to die — it did not, but every progress update went to a component
    that no longer existed. Reading it from context means this page shows the
    same run the shell strip does, and finds it still going on return.
  */
  const run = trackingRun;
  // A run started against a different site is somebody else's progress as far
  // as this page is concerned.
  const runningHere = run.busy && run.siteId === site?.id;

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

  /*
    ⚠️ THE GATE IS canViewTracking, NOT canTrack.

    Someone whose window lapsed keeps the report they paid to collect — the
    pricing page promises "everything you make stays yours for good", and
    hiding measurements behind an upgrade card would break that promise on the
    screen that made it. What the window governs is RUNNING a new check, which
    spends money; every one of those controls is gated on `canRun` below.
  */
  /*
    ⚠️ NO canViewTracking GATE HERE ANY MORE, AND ITS ABSENCE IS THE POINT.

    Results is readable by everyone. Free accounts have one real reading to look
    at, taken during their onboarding scan, and a lapsed Pro account keeps every
    reading it paid to collect — the plan governs what may be RUN, never what may
    be READ. Hiding measurements somebody's own account produced, to sell them
    back, is the one thing this page must not do.
  */

  /*
    ⚠️ TWO QUESTIONS, AND THEY USED TO BE ONE VARIABLE.

      canGrowList — may this account have more questions found or written?
      canRunNow   — may this customer start a check by hand, right now?

    They were both the same predicate, which was fine while every plan had a
    button. Free's single check runs itself and has none, and collapsing these
    again would silently switch question discovery off for free accounts — a
    feature that costs an Opus call rather than engine calls.
  */
  const pro = isPro(user);
  const canGrowList = pro;
  const canRunNow = canRunCheckNow(user);
  const oneShot = trackingPlanFor(user).schedule === 'once';

  const daily = tracking?.daily ?? [];
  const latest = tracking?.latest ?? [];

  /*
    Nothing checked yet.

    ⚠️ THIS IS "WE HAVE NOT LOOKED", NOT "NOBODY CITES YOU". `tracking` is null
    until a run has actually stored rows — see trackingFromDb() — precisely so
    this state can say the first thing rather than showing zeros that read as
    the second. Zeros here would be a measurement we never took.

    For a free account this is the state between signing up and the onboarding
    scan reaching its tracking stage — a few minutes, not a dead end.
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
              canRunNow ? (
                <Button onClick={runTracking} disabled={run.busy}>
                  {runningHere
                    ? 'Checking…'
                    : run.busy
                      ? 'Another check is running'
                      : 'Run the first check'}
                </Button>
              ) : oneShot ? (
                // Nothing to press: the check runs itself as part of setting the
                // site up, and free gets exactly the one.
                <p className="text-slate text-sm">Your check runs as part of setting up.</p>
              ) : (
                <ButtonLink href="/dashboard/plan">See Pro</ButtonLink>
              )
            }
          />
        )}

        {runningHere && <RunProgress run={run} className="mx-auto mt-5 max-w-sm" />}
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
  const visibility = visibilityFindings(site, user, tracking);
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
  /*
    One row per question, holding every engine's check.

    ⚠️ A CONTAINER, NOT A SUMMARY. Each check keeps its own answer, sources and
    `citedInstead` — see the note on QuestionRow. `latest` is untouched;
    everything else on this page still reads the deduped pair rows.
  */
  const groups: QuestionGroup[] = [];
  {
    const byQuestion = new Map<string, QuestionGroup>();
    for (const check of latest) {
      let group = byQuestion.get(check.question);
      if (!group) {
        group = { question: check.question, checks: [], checkedAt: check.checkedAt, sources: 0 };
        byQuestion.set(check.question, group);
        groups.push(group);
      }
      group.checks.push(check);
      group.sources += check.sources.length;
      // The freshest sighting, so "2 days ago" is the most recent evidence
      // rather than whichever engine happened to be stored first.
      if (check.checkedAt > group.checkedAt) group.checkedAt = check.checkedAt;
    }
  }

  /*
    Chips carry BOTH units, because the row and the tile above count different
    things and both are true: one engine citing you on a question the other two
    missed is one check and one question, while two engines citing the same
    question is two checks and one question. Printing one number and letting the
    reader assume the other is how "these don't add up" starts.
  */
  const countFor = (id: OutcomeFilter) => {
    const checks = id === 'all' ? latest : latest.filter((c) => c.outcome === id);
    const questions = new Set(checks.map((c) => c.question)).size;
    return { checks: checks.length, questions };
  };

  /*
    Filtering finds the QUESTION; the expansion still shows every engine.

    Narrowing the expansion to matching engines would hide the comparison this
    grouping exists to provide — "cited by Perplexity, absent on ChatGPT" is one
    finding, and you cannot see it if the filter removes half of it.
  */
  const filtered =
    filter === 'all' ? groups : groups.filter((g) => g.checks.some((c) => c.outcome === filter));
  const visible = filtered.slice(0, shown);
  // The bar tracks prompts — the thing bought — not the checks they cost.
  const usedPct = tracking ? (tracking.promptsTracked / tracking.promptCap) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Results"
        description={`What ${ENGINES.join(', ')} say when asked about ${site.name}.`}
        /* Free has no button — its one check has already run. The upgrade is the
           honest answer to what the button was for. */
        action={
          canRunNow ? (
            <Button variant="ghost" size="sm" onClick={runTracking} disabled={run.busy}>
              {runningHere ? 'Checking…' : run.busy ? 'Another check is running' : 'Check now'}
            </Button>
          ) : (
            <ButtonLink href="/dashboard/plan" variant="ghost" size="sm">
              Check weekly with Pro
            </ButtonLink>
          )
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
        to it.{' '}
        {/* ⚠️ The country belongs in the same breath as "how we asked", not in
            a settings screen the customer has already left. Results asked from
            the US and from the UK are different measurements — see the country
            column on citation_checks and the note on audit_runs.depth. */}
        {site.country ? (
          <>
            Asked as someone in{' '}
            <span className="text-navy font-medium">{countryLabel(site.country)}</span> — except
            Gemini, which can&rsquo;t be given a location.
          </>
        ) : (
          <>
            No country is set, so each engine answers from wherever it defaults to.{' '}
            <Link href="/dashboard/sites" className="text-primary hover:text-primary-hover">
              Set your market
            </Link>{' '}
            to see what your customers would be told.
          </>
        )}
      </p>

      {(run.error || run.notes.length > 0 || run.unreadable || runningHere) && (
        <div className="mb-5">
          {runningHere && <RunProgress run={run} className="max-w-sm" />}
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
          <CitationChart
            daily={daily}
            span={oneShot ? 'from your one check' : 'over the last 30 days'}
          />

          {/*
            What used to be a four-point timeline is one line of text.

            CheckSchedule rendered tracking_milestones — days 7, 30, 60 and 90
            with a status each — because Get Cited promised four specific checks
            and a customer could reasonably ask which of them had happened. A
            weekly cadence has no such list to keep score against: what ran is
            the chart above, and what is coming is one date.
          */}
          {!oneShot && tracking?.nextCheckAt && (
            <p className="text-slate text-sm">
              Next automatic check {timeUntil(tracking.nextCheckAt)}. We ask every week without you
              having to do anything.
            </p>
          )}

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
                      <p className="text-navy text-sm font-semibold">
                        {e.engine}
                        {/* ⚠️ Marked, never labelled with the country. Gemini
                            rejects a location parameter and the coordinate
                            route was tested and does not localise, so putting
                            "United Kingdom" on this row would claim a
                            targeting that did not happen. Only shown when a
                            country is set — with none set, no engine is
                            targeted and the note would single one out for
                            nothing. */}
                        {site.country && e.engine === 'Gemini' && (
                          <span className="text-slate ml-2 text-xs font-normal">
                            not location-targeted
                          </span>
                        )}
                      </p>
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
              <Badge tone="cyan">
                {formatNumber(groups.length)} {groups.length === 1 ? 'question' : 'questions'}
              </Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              One row per question, newest first. Open any of them to read what{' '}
              {ENGINES.join(', ')} each said, side by side, and which sources each one used.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const { checks, questions } = countFor(f.id);
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
                    {f.label} · {checks} {checks === 1 ? 'check' : 'checks'}, {questions}{' '}
                    {questions === 1 ? 'question' : 'questions'}
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
                {visible.map((group) => (
                  <QuestionRow
                    key={group.question}
                    group={group}
                    action={
                      /* The loop closing: see you weren't cited, write the
                         answer, the question stops being open.

                         ONE button per question now, not one per engine. The
                         draft answers the question, not the engine — three
                         identical buttons on one question was always wrong, and
                         grouping is what made it obvious. Offered whenever any
                         engine failed to cite you, since that is the gap the
                         answer would close. */
                      group.checks.some((c) => c.outcome !== 'cited') ? (
                        <DraftIntoGroup
                          question={group.question}
                          onDrafted={async () => {
                            const match = questions.find((q) => q.question === group.question);
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
                {/* ⚠️ The ceiling comes from the plan now, not from multiplying
                    three fields back together here. The two plans have different
                    caps, and an arithmetic copy in the UI is how a customer ends
                    up refused at a number the screen never showed them.

                    ⚠️ `periodResetsAt` is NULL on free, meaning the allowance
                    never refills. Printing "resets" against a missing date would
                    promise a top-up that never comes, so the sentence branches on
                    the value rather than on the plan. */}
                <p className="text-slate mt-0.5 text-xs">
                  {formatNumber(tracking.checksUsed)} of {formatNumber(tracking.checksCap)} engine
                  checks · each prompt is asked {ENGINES.length} engines × {tracking.runsPerPeriod}{' '}
                  {tracking.runsPerPeriod === 1 ? 'time' : 'times'}
                  {tracking.periodResetsAt ? ` · resets ${timeUntil(tracking.periodResetsAt)}` : ''}
                </p>
              </div>
              <Meter className="mt-3" value={usedPct} />

              {/* Widening the sample, from the screen that shows why you'd want
                  to. Every state below is a different answer to "can I have
                  more?", and none of them is a disabled button with no reason
                  given. */}
              <div className="border-line mt-4 border-t pt-4">
                {!canGrowList ? (
                  <p className="text-slate text-xs">
                    Finding more questions is part of Pro — your existing list and results
                    stay here either way.
                  </p>
                ) : more.room === 0 ? (
                  // ⚠️ "Discovery is full", NOT "your watch list is full". With
                  // 25 discovered and no manual questions there are still ten
                  // slots left, and calling that full would be untrue — and
                  // would send someone to delete a question they didn't need to.
                  <p className="text-slate text-xs">
                    We&rsquo;ve found the {formatNumber(tracking.promptCap - tracking.manualCap)}{' '}
                    questions this plan looks for. You can still add{' '}
                    {formatNumber(tracking.manualCap)} of your own below, or retire one on{' '}
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

                {!canGrowList ? (
                  <p className="text-slate text-xs">
                    You can add your own questions again once the window is open — there would be
                    nothing to check them with right now.
                  </p>
                ) : manual.room === 0 ? (
                  <p className="text-slate mt-1 text-xs">
                    {manual.used >= tracking.manualCap
                      ? `You've added all ${tracking.manualCap} of your own. Remove one on `
                      : `Your watch list is full at ${formatNumber(tracking.promptCap)} prompts. Make room on `}
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
                        {manual.used} of {tracking.manualCap} of your own
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
