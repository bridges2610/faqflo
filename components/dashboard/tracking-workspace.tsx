'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EngineMark } from '@/components/ui/ai-marks';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { ScoreDial } from '@/components/ui/score-dial';
import { StatusIcon, STATUS_WORD } from '@/components/ui/status-icon';
import { pillarBand, scoreOf } from '@/lib/audit/score';
import type { CheckStatus } from '@/lib/audit/types';
import { visibilityFindings } from '@/lib/dashboard/audit-context';
import { useDashboard, type TrackingRun } from '@/lib/dashboard/provider';
import { discoverQuestions } from '@/lib/dashboard/discover';
import { canRunCheckNow, isPro, trackingPlanFor } from '@/lib/dashboard/plans';
import { formatNumber, timeAgo, timeUntil } from '@/lib/dashboard/format';
import { ENGINES, type SiteTracking } from '@/lib/dashboard/types';
import {
  checksByEngine,
  groupByQuestion,
  insteadFor,
  type QuestionGroup,
} from '@/lib/dashboard/questions';
import { CitationChart } from './citation-chart';
import { DraftIntoGroup } from './draft-into-group';
import {
  EngineDetailList,
  EnginePill,
  OutcomeBar,
  OutcomeLegend,
  type OutcomeSplit,
} from './engine-detail';
import { PromptMatrix } from './prompt-matrix';
import { QuestionControls } from './question-controls';
import { EmptyState } from './empty-state';
import { Meter } from './meter';
import { RunProgress } from './run-progress';
import { countryLabel } from './search-country';
import { AeoIcon, ChevronIcon, DocIcon, FaqIcon, GlobeIcon } from './nav-icons';
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
  const byEngine = checksByEngine(group);

  // Who took the click, from the first engine that named someone else. One
  // rival stands for the group; the per-engine detail is in the expansion.
  const instead = insteadFor(group);

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
                    · AI sent people to <span className="text-navy font-medium">{instead}</span>
                  </>
                )}
              </p>
            </div>

          </div>
        </summary>

        {/* ⚠️ THE ACTIONS ARE INSIDE THE DISCLOSURE, NOT BESIDE THE QUESTION.

            They used to sit in a `shrink-0` slot on the summary row, which was
            sized for one small "Draft an answer" button. The curate controls —
            reorder, reword, stop watching — are a 318px cluster, and shrink-0
            meant they could not give any of it back: at 360px the row ran 43px
            past the viewport and the whole page scrolled sideways.

            Putting them here also matches the matrix, which has always kept its
            actions in the expanded row, and it un-squeezes the question itself:
            the text had been sharing the line with a button that never yielded.
        */}
        <div className="mt-3">
          <EngineDetailList group={group} />
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </details>
    </li>
  );
}

type OutcomeFilter = 'all' | 'cited' | 'mentioned' | 'absent';

const FILTERS: { id: OutcomeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  /* The same four words the cells use — a filter labelled differently from the
     thing it filters is a puzzle. See OUTCOME_STYLE in engine-detail.tsx. */
  { id: 'cited', label: 'Linked' },
  { id: 'mentioned', label: 'Named only' },
  { id: 'absent', label: 'Not named' },
];

/** Rows per page. Forty answers at once is a data dump, not a report. */
const PAGE = 10;

/**
 * A change since the last run, or nothing at all.
 *
 * ⚠️ NOTHING, not "0%" and not "—". A placeholder in the shape of a statistic
 * gets read as one; an absent delta reads as "no trend yet", which is the true
 * state of a site that has run checks once.
 *
 * ⚠️ NO LEADING " · ". It returned one while this was appended to a footer
 * sentence; it now stands alone under a figure, where a separator with nothing
 * before it is just a stray dot. One caller, so the function changed rather
 * than the call site.
 */
function deltaLabel(delta: number | null): string {
  if (delta === null) return '';
  const rounded = Math.round(delta);
  if (rounded === 0) return 'No change since the last run';
  return `${rounded > 0 ? '+' : ''}${rounded}% since the last run`;
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
        <PageHeader title="AI Mentions" description="Whether AI is actually naming you." />
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
    button. Collapsing them again would silently switch question discovery off
    for free accounts — a feature that costs an Opus call rather than engine
    calls.

    ⚠️ canRunNow IS TRUE FOR EVERYONE NOW, AND THE VARIABLE STAYS ANYWAY. Free
    gained a Run button on its own report, so the predicate stopped
    discriminating — but this route is Pro-only, so the branches below that test
    it are unreachable rather than wrong. Left standing because the question is
    still the right one to ask here: if the entitlement ever tightens again this
    page reads correctly without being rewritten, and inlining `true` would lose
    the reason the check exists.
  */
  const pro = isPro(user);
  const canGrowList = pro;
  const canRunNow = canRunCheckNow();
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
        <PageHeader title="AI Mentions" description={`What the engines say about ${site.name}.`} />
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
                /* ⚠️ `() => runTracking()`, never `onClick={runTracking}`. It
                   takes an optional question list now, so passing the handler
                   bare hands it the MouseEvent as that list. */
                <Button onClick={() => void runTracking()} disabled={run.busy}>
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

  const competitors = tracking?.competitors ?? [];
  const citedPages = tracking?.citedPages ?? [];
  const byEngine = tracking?.byEngine ?? [];
  /*
    The three rows of the score card, as figures rather than sentences.

    ⚠️ STATUS FROM THE FINDING, FIGURE FROM THE DATA, AND NEITHER IS RESTATED.
    `visibility` is what scoreOf() weighs, so taking each row's status from it
    is what stops the icons and the number disagreeing — a green tick beside a
    score of 31 is the kind of thing nobody reports and everybody stops
    trusting. The figures are counted here from the same `tracking` those
    findings counted, so there is no second source and no prose to keep in step.

    ⚠️ EVERY ROW IS A RATIO, WHICH IS WHY EVERY ROW MAY HAVE A BAR. meter.tsx
    only permits one where the proportion is already readable beside it. "3 of
    14" and "25%" both print their own halves; a bare count would not, and a bar
    under one would invent a ceiling nobody set.
  */
  const statusOf = (id: string): CheckStatus =>
    visibility.find((f) => f.id === id)?.status ?? 'na';


  const enginesNaming = byEngine.filter((e) => e.cited + e.mentioned > 0).length;

  /*
    Every answer, split three ways.

    ⚠️ EXHAUSTIVE BY CONSTRUCTION, NOT BY ARITHMETIC. CitationCheck['outcome']
    is 'cited' | 'mentioned' | 'absent' and these three counts are filtered from
    the same array, so they sum to latest.length without anything here having to
    subtract. The old "Left you out" tile was `absent` printed as if it were an
    independent measurement; it is the remainder, and a bar is the honest way to
    show a remainder.
  */
  const split: OutcomeSplit[] = [
    { outcome: 'cited', count: cited, note: deltaLabel(citedDelta) },
    { outcome: 'mentioned', count: mentioned },
    { outcome: 'absent', count: absent },
  ];

  /*
    ⚠️ THE `cited` FINDING IS NOT LISTED HERE ANY MORE, AND IT HAS NOT BEEN
    DROPPED — it is the bar. "15 of 81 answers linked to you" was a row here AND
    a tile below AND, as its own complement, a second tile reading "left you
    out: 66". Those are one number split three ways, so they are now one split
    bar. What is left in this list is the two facts that are genuinely separate
    from that split: how many AI tools name you at all, and how much of the
    source pool is yours.

    `statusOf('cited')` still feeds the score through visibilityFindings; it is
    only its ROW that went.
  */
  /*
    ⚠️ ONE SENTENCE EACH, NOT A LABEL WITH ITS NUMBER PUSHED TO THE FAR RIGHT.
    "Websites AI used that are yours ........................ 3%" makes the
    reader carry a label across the card to meet its figure. A sentence carries
    both at once, and these two are supporting facts — the split above is what
    the card is for.

    They also lost their Meters. meter.tsx PERMITS a bar where the value prints
    both halves; it does not require one. Two bars down here competed with the
    one bar that is the point of the card, which is what made this read as two
    designs stacked.
  */
  const headline = [
    {
      id: 'engine-spread',
      sentence:
        enginesNaming === ENGINES.length
          ? `All ${ENGINES.length} AI tools name you`
          : `${enginesNaming} of ${ENGINES.length} AI tools name you`,
      status: statusOf('engine-spread'),
    },
    {
      id: 'share-of-voice',
      sentence: `${shareOfVoice.toFixed(0)}% of the websites AI used are yours`,
      status: statusOf('share-of-voice'),
    },
  ];

  /*
    The ranking, trimmed to a readable length.

    A real site draws on 200+ distinct domains, and a list that long is a data
    dump rather than a finding. Top twelve, plus OUR row appended at its true
    rank whenever we fall outside it — a share-of-voice board that can silently
    omit the reader is worse than no board, and "you: 47th" is precisely the
    fact they came for.
  */
  const SHARE_ROWS = 10;
  const ranked = competitors.map((c, i) => ({ ...c, rank: i + 1 }));
  const shareRows = ranked.slice(0, SHARE_ROWS);
  const you = ranked.find((c) => c.isYou);
  if (you && !shareRows.some((c) => c.isYou)) shareRows.push(you);

  // The meter divides by this, so it has to be the largest bar actually drawn.
  const shareTop = Math.max(...shareRows.map((c) => c.citations), 1);

  /*
    One row per question, holding every engine's check.

    ⚠️ A CONTAINER, NOT A SUMMARY. Each check keeps its own answer, sources and
    `citedInstead` — see the note on QuestionRow. `latest` is untouched;
    everything else on this page still reads the deduped pair rows.

    The grouping itself moved to lib/dashboard/questions.ts when Home grew a
    per-question breakdown of its own. It is the same transform on both screens
    deliberately: a second copy here would be free to disagree with that one
    about how many questions a customer has.
  */
  /*
    ⚠️ THE LIST IS THE QUESTIONS, JOINED TO THE CHECKS — NOT THE OTHER WAY ROUND.

    This was groupByQuestion(latest) alone, which builds rows out of the CHECKS.
    Two things follow from that and both are wrong now that the owner curates
    this list:

      1. A question added a minute ago has no checks, so it did not appear at
         all. You typed it, the list did not change, and the only hint was a
         line of text elsewhere saying it would show up after the next run.
      2. Nothing the owner does to the order could survive, because the rows
         were derived from measurements rather than from their list.

    So the rows come from `questions`, in the owner's `position` order, and each
    one is joined to its checks by question text — the same string equality
    0009 pins tracked_prompts to. A question with no checks yet renders as a
    real row whose three cells read "not asked", which is exactly true.
  */
  const measured = new Map(groupByQuestion(latest).map((g) => [g.question, g]));

  const groups: QuestionGroup[] = [...questions]
    .sort((a, b) => a.position - b.position)
    .map(
      (q) =>
        measured.get(q.question) ?? {
          question: q.question,
          checks: [],
          /* ⚠️ addedAt, AND THE ROW MUST NOT PRINT IT AS A CHECK TIME. Nothing
             has been checked, so "2 days ago" beside this row would date a
             measurement that never happened. prompt-matrix.tsx suppresses the
             timestamp when checks is empty. */
          checkedAt: q.addedAt,
          sources: 0,
        },
    );

  /*
    Chips carry BOTH units, because the row and the tile above count different
    things and both are true: one AI linking to you on a question the other two
    missed is one answer and one question, while two AIs linking on the same
    question is two answers and one question. Printing one number and letting
    the reader assume the other is how "these don't add up" starts.

    Questions lead, answers follow. A customer thinks in questions — they are
    what gets watched and what the plan is sold in — so the answer count is the
    supporting detail rather than the headline.
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
  /* ⚠️ SORTED AFTER FILTERING, AND BOTH LAYOUTS GET THE SAME ARRAY. Best
     results lead — most citations, then most mentions — so the top of the table
     is the proof the subscription bought. Pagination slices this, so "Show 12
     more" reveals progressively weaker rows rather than an arbitrary tail. */
  /*
    ⚠️ THE OWNER'S ORDER WINS, SO sortByCitations IS GONE FROM HERE.

    It sorted best-results-first, which was right while this list was derived
    from measurements and nobody could arrange it. The owner can arrange it now,
    and a reorder control whose result is immediately re-sorted away is a handle
    attached to nothing — the exact failure this dashboard keeps writing down.
    Filtering still narrows; it never reorders.
  */
  const filtered =
    filter === 'all' ? groups : groups.filter((g) => g.checks.some((c) => c.outcome === filter));
  const visible = filtered.slice(0, shown);

  /*
    The loop closing: see you weren't cited, write the answer, the question
    stops being open.

    ONE button per question, not one per engine. The draft answers the question,
    not the engine — three identical buttons on one question was always wrong,
    and grouping is what made it obvious. Offered whenever any engine failed to
    cite you, since that is the gap the answer would close.

    It is a function rather than JSX because both layouts below need their own
    instance of it per row, and the two must offer the identical button.
  */
  /* The question row this group came from, for the controls. Matched by text,
     the same join the rows themselves are built on. */
  const ordered = [...questions].sort((a, b) => a.position - b.position);

  const draftAction = (group: QuestionGroup) => {
    const q = ordered.find((x) => x.question === group.question);
    const index = q ? ordered.indexOf(q) : -1;

    return (
      <div className="space-y-3">
        {q ? (
          <QuestionControls
            question={q}
            /* Straight from the checks on the row rather than a second lookup —
               the group IS the join, and asking twice is how the button and the
               store end up disagreeing about whether an edit is allowed. */
            hasResults={group.checks.length > 0}
            isFirst={index === 0}
            isLast={index === ordered.length - 1}
          />
        ) : null}
        {draftButton(group)}
      </div>
    );
  };

  const draftButton = (group: QuestionGroup) =>
    group.checks.some((c) => c.outcome !== 'cited') ? (
      <DraftIntoGroup
        question={group.question}
        onDrafted={async () => {
          const match = questions.find((q) => q.question === group.question);
          if (match) await coverQuestion(match.id);
        }}
      />
    ) : undefined;
  // The bar tracks prompts — the thing bought — not the checks they cost.
  const usedPct = tracking ? (tracking.promptsTracked / tracking.promptCap) * 100 : 0;

  return (
    <>
      <PageHeader
        className="mb-3"
        title="AI Mentions"
        description={`What ${ENGINES.join(', ')} say when asked about ${site.name}.`}
        /* This route is Pro-only, so canRunNow is always true here now — see
           the note where it is derived. The branch stays because the question
           is still the right one for this screen to ask. */
        action={
          canRunNow ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void runTracking()}
              disabled={run.busy}
            >
              {runningHere ? 'Checking…' : run.busy ? 'Another check is running' : 'Check now'}
            </Button>
          ) : (
            <ButtonLink href="/dashboard/plan" variant="ghost" size="sm">
              Check weekly with Pro
            </ButtonLink>
          )
        }
      />

      {/* ⚠️ COLLAPSED, NOT CUT, AND THE DISTINCTION MATTERS.

          We query each vendor's API — the OpenAI API with web search, Gemini
          with Google Search grounding — not chatgpt.com or gemini.google.com.
          Different system prompt, different retrieval, no personalisation. It
          is the closest honest proxy that can be measured, and calling it "what
          ChatGPT told your customer" would be exactly the overclaim this
          product stripped out of its own pricing page. So it is still said, in
          full, in the reader's own words — it just no longer costs 76 words at
          the top of the page before a single result.

          ⚠️ The country stays inside it. Results asked from the US and from the
          UK are different measurements — see the country column on
          citation_checks — so it belongs with "how we asked", not in a settings
          screen. The no-country branch is the exception and stays OUTSIDE the
          disclosure below: it is not a caveat, it is a thing to go and fix. */}
      {/* ⚠️ ONE BLOCK, ONE MARGIN. These are one idea — how we asked — and they
          each carried their own mb-5, which with the header's mb-8 and the
          notice's mb-6 above them stacked to 289px of gap before the first
          number on the page. Measured, not estimated. */}
      <div className="mb-5 space-y-2">
        <Disclosure label="How we check">
          <p className="text-slate text-sm leading-relaxed">
            We ask each AI the same questions a customer would. We save what it says.
          {site.country ? (
            <>
              {' '}
              We ask as someone in{' '}
              <span className="text-navy font-medium">{countryLabel(site.country)}</span>. Gemini
              is the exception. It cannot be given a location.
            </>
          ) : null}{' '}
          The answers are very close to what a customer sees. They are not word for word.
        </p>
        </Disclosure>

        {!site.country && (
          <p className="text-slate text-sm leading-relaxed">
            No country is set, so each AI answers from wherever it defaults to.{' '}
            <Link href="/dashboard/sites" className="text-primary hover:text-primary-hover">
              Set your market
            </Link>{' '}
            to see what your customers are told.
          </p>
        )}
      </div>

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
          nothing. These three rows ARE the score — same findings, same weights,
          same arithmetic — so the card explains itself rather than asking for
          trust.

          ⚠️ THE ROWS SHOW NUMBERS, NOT THE FINDINGS' SENTENCES, AND THE
          SENTENCES ARE NOT GONE. visibilityFindings() also feeds Your site
          (audit-workspace.tsx), which renders `detail` in full and should. This
          card printed three sentences of 15 to 26 words each and made the
          reader parse "3 of the 14 answers we checked" out of prose to get a
          figure that fits in four characters. So the STATUS comes from the
          finding — the icon and the score can never disagree — and the FIGURE
          is derived here from the same `tracking` the finding counted. Nothing
          is restated in two voices, because nothing is restated at all. */}
      {visibilityScore !== null && (
        <Card className="mb-5 p-5 sm:p-7">
          <div className="sm:flex sm:items-center sm:gap-8">
            <div className="flex shrink-0 items-center gap-4 sm:block">
              {/* ⚠️ NO `stroke`, SO THE ARC RUNS THE BRAND GRADIENT AND CLAIMS
                  NOTHING. score-dial.tsx only permits a banded colour where the
                  band's WORD is adjacent; the word is the Badge below, but the
                  gradient is the documented default and the safer one. */}
              <ScoreDial score={visibilityScore} size="sm" caption="out of 100" />
              <div className="sm:mt-3">
                {/* Sentence case, to match the tiles below. The small-caps
                    version of this sat directly above four tiles that had just
                    stopped shouting, which made it the last thing on the page
                    still dressed as a system field. */}
                <p className="text-slate text-xs font-semibold">AI visibility</p>
                <Badge
                  tone={band === 'good' ? 'success' : band === 'mixed' ? 'cyan' : undefined}
                  className="mt-1.5"
                >
                  {band === 'good' ? 'Strong' : band === 'mixed' ? 'Mixed' : 'Low'}
                </Badge>
              </div>
            </div>

            <div className="mt-5 flex-1 sm:mt-0">
              {/* The split, first and largest. This is the answer to "how am I
                  doing" — everything below it is a qualifier on it. */}
              <p className="text-navy text-sm font-semibold">
                Of the {formatNumber(latest.length)}{' '}
                {latest.length === 1 ? 'answer' : 'answers'} we checked
              </p>
              <OutcomeBar splits={split} total={latest.length} className="mt-2.5" />

              <ul className="border-line mt-5 space-y-2 border-t pt-4">
                {headline.map((row) => (
                  <li key={row.id} className="flex items-center gap-2.5">
                    {/* ⚠️ THE ICON IS aria-hidden AND OWES A WORD, and the word
                        goes INSIDE the sentence, not in front of it.
                        status-icon.tsx states the debt — "a tick and a cross at
                        14px are the same smudge to a colourblind reader" — and
                        audit-workspace.tsx and readability-checklist.tsx both
                        pay it by appending "— Pass" to the label. Written as a
                        standalone span before it, as this was, the word becomes
                        its own line: copying the card produced "Pass:" on one
                        line and the sentence on the next. */}
                    <StatusIcon status={row.status} className="h-4 w-4 shrink-0" />
                    <p className="text-navy text-sm">
                      {row.sentence}
                      <span className="sr-only"> — {STATUS_WORD[row.status]}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}


      {/* The trend, and the two things you act on beside it.

          The chart is the only thing left in the left column — the per-engine
          summary moved out below the matrix, so this grid is now exactly what
          its name says: one chart, one rail. The rail holds the budget and the
          add-a-question form, which are what you DO after reading the trend. */}

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
                  questions watched
                </p>
                {/* ⚠️ The ceiling comes from the plan now, not from multiplying
                    three fields back together here. The two plans have different
                    caps, and an arithmetic copy in the UI is how a customer ends
                    up refused at a number the screen never showed them.

                    ⚠️ `periodResetsAt` is NULL on free, meaning the allowance
                    never refills. Printing "resets" against a missing date would
                    promise a top-up that never comes, so the sentence branches on
                    the value rather than on the plan. */}
                {/* Three facts, three lines. They were one 20-word run of
                    dot-separated clauses, which is a paragraph pretending to be
                    a data row — and the one thing on this page that still read
                    above the reading-level target. */}
                <p className="text-slate mt-0.5 text-xs">
                  {formatNumber(tracking.checksUsed)} of {formatNumber(tracking.checksCap)} answers
                  collected.
                </p>
                <p className="text-slate mt-0.5 text-xs">
                  Every question goes to {ENGINES.length} AI tools, {tracking.runsPerPeriod}{' '}
                  {tracking.runsPerPeriod === 1 ? 'time' : 'times'}.
                </p>
                {tracking.periodResetsAt && (
                  <p className="text-slate mt-0.5 text-xs">
                    Resets {timeUntil(tracking.periodResetsAt)}.
                  </p>
                )}
              </div>
              <Meter className="mt-3" value={usedPct} />

              {/* Widening the sample, from the screen that shows why you'd want
                  to. Every state below is a different answer to "can I have
                  more?", and none of them is a disabled button with no reason
                  given. */}
              <div className="border-line mt-4 border-t pt-4">
                {!canGrowList ? (
                  <p className="text-slate text-xs">
                    Finding more questions is part of Pro. Your list and results stay
                    here either way.
                  </p>
                ) : more.room === 0 ? (
                  // ⚠️ "Discovery is full", NOT "your watch list is full". With
                  // 25 discovered and no manual questions there are still ten
                  // slots left, and calling that full would be untrue — and
                  // would send someone to delete a question they didn't need to.
                  <p className="text-slate text-xs">
                    We&rsquo;ve found the {formatNumber(tracking.promptCap - tracking.manualCap)}{' '}
                    questions this plan looks for. You can add{' '}
                    {formatNumber(tracking.manualCap)} of your own, or retire one on{' '}
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
                    Run a full check of your site first. Finding questions means reading
                    your pages.
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
                      Finds questions you aren&rsquo;t watching yet. They go on your next
                      run.
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
                        'Nothing new. Every question we found was one you already watch.'
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
                    You can add your own again when the window opens. Right now there is
                    nothing to check them with.
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

      {/* ⚠️ ABOVE THE CHART, NOT BELOW IT, AND FULL WIDTH.

          This is the answer to the question the customer opened the page
          with — which of my questions does AI name me on. It used to sit
          under a 30-day trend line and a per-engine summary, so the evidence
          came third and the reader had to scroll past two abstractions of it
          to reach it. The chart is a good second question ("is it getting
          better?") and a bad first one, because a trend of a number you have
          not seen yet means nothing.

          It is outside the 1fr+20rem grid below because the matrix needs the
          whole width — in that grid's left column it is 632px on a 1280px
          laptop, narrower than the table's own minimum, and it scrolled. */}
      {/* Every check, filterable — one table instead of three cards.

          ⚠️ THREE CARDS SPLIT THE EVIDENCE BY ANSWER, WHICH IS THE ONE WAY
          IT SHOULD NOT BE SPLIT. "Cited for", "Named but not linked" and
          "Not cited for" were three lists of the same rows sliced by
          outcome, so comparing them meant scrolling between cards, and
          nothing showed what the engine had actually said. A filter does
          the slicing without hiding the whole from you. */}
      <Card className="mt-6 p-5 sm:p-7">
        {/* ⚠️ THE TINTS ARE IDENTITY, NOT STATE — see the note on
            SectionTitle's `tint`. They reuse the exact pairs the metric tiles
            above already carry, so a reader who has learned "green means the
            AI linked to you" on a tile is not taught something else here.
            bg-accent-soft takes -ink text: --color-accent is fill-only at
            1.9:1 and never a text colour. */}
        <SectionTitle icon={<FaqIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
          Which questions name you
        </SectionTitle>
        {/* ⚠️ BOTH NUMBERS ARE COUNTED, NOT CLAIMED — one prompt per row we
            are about to render, and the engines we actually ask. This
            replaced a cyan Badge saying the same question count a second
            time, one line above the sentence that says it in words. */}
        <p className="text-slate mt-1 text-sm">
          {formatNumber(groups.length)} {groups.length === 1 ? 'question' : 'questions'}, asked of{' '}
          {ENGINES.length} AI tools. Best results first. Click a row to see the answer.
        </p>

        {/* ⚠️ THE KEY, NOT A PARAGRAPH ABOUT THE KEY. Four chips beside four
            short glosses replaced 65 words of prose — a 22-word blurb here and
            a 43-word note at the foot of the card. It is built from the same
            constants the cells are, so it cannot drift from them. */}
        <OutcomeLegend className="mt-3" />

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
                {f.label} · {questions} {questions === 1 ? 'question' : 'questions'},{' '}
                {checks} {checks === 1 ? 'answer' : 'answers'}
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
          /*
            ⚠️ TWO LAYOUTS, ONE DATA SET, AND THE SPLIT IS AT sm.

            Four columns do not fit a phone. The grid is the right shape the
            moment there is room for it — the comparison across engines is
            the finding, and a fixed column per engine states it — and the
            list is the right shape when there is not.

            ⚠️ NEITHER BRANCH OWNS ANY LOGIC. Both render `visible`, both
            call draftAction(), and both open to the same
            <EngineDetailList/>. prompt-ranking.tsx states the rule for its
            own pair of branches, and it holds harder here: a second copy of
            the null-is-a-gap-not-a-no reading is what would let one of these
            two claim a measurement nobody took.
          */
          <>
            <div className="mt-2 hidden sm:block">
              <PromptMatrix groups={visible} action={draftAction} />
            </div>

            <ul className="divide-line mt-2 divide-y sm:hidden">
              {visible.map((group) => (
                <QuestionRow key={group.question} group={group} action={draftAction(group)} />
              ))}
            </ul>
          </>
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

        {/* The 43-word "Named only means…" note stood here. Its first half is
            now the legend's gloss and its second half is an action, so what is
            left is the action alone. */}
        {mentioned > 0 && (
          <p className="text-slate mt-4 text-sm">
            Got a “named only”? Your answer needs to be on a page AI can link to. Check{' '}
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

      {/* ⚠️ OUT OF THE GRID AND AFTER THE MATRIX. This was in the grid's left
          column under the chart, which put a per-engine summary between the
          trend and the evidence. Summary, then detail, then per-engine is the
          order a reader actually wants; and out here it gets the full width
          the rest of the page has. */}
      {/* Per engine.

          The tiles above average the three together, which hides the most
          useful shape in the data: being cited on one engine and invisible
          on another is a different problem from being invisible everywhere,
          and it is fixable. Denominators are per engine and never assumed
          equal — a run where one engine 429s leaves it genuinely behind. */}
      {byEngine.some((e) => e.checked > 0) && (
        <Card className="mt-6 p-5 sm:p-7">
          <SectionTitle icon={<AeoIcon className="h-4 w-4" />} tint="bg-accent-soft text-teal-ink">
            How each AI did
          </SectionTitle>
          <p className="text-slate mt-1 text-sm">
            The same questions, one AI at a time.
          </p>

          <ul className="divide-line mt-3 divide-y">
            {byEngine.map((e) => (
              <li key={e.engine} className="py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {/* The mark, the name and the Gemini note are one line.

                      `items-center` inside a row that aligns on the
                      baseline: the logo has no baseline of its own, so it
                      is centred against the name, and this box still hands
                      the name's baseline up to the row so the percentage
                      on the right stays level with it. */}
                  <p className="text-navy flex items-center gap-2 text-sm font-semibold">
                    <EngineMark engine={e.engine} className="h-4 w-4 shrink-0" />
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
                      // The ml-2 this used to carry is now the parent's
                      // gap-2 — the row is flex, so a margin would stack
                      // on top of the gap and set this note further out
                      // than the mark is from the name.
                      <span className="text-slate text-xs font-normal">
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
                        of {e.checked} name you · {e.cited} linked
                        {e.mentioned > 0 && <> · {e.mentioned} named only</>}
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

      {/* The context, last: which of your pages are working, and who else the
          engines draw on. Both are about the field rather than about you, so
          they come after the evidence and the trend rather than competing with
          them for the top of the page.

          Outside the grid above, like the matrix — they were in its left
          column, and nothing here needs to sit beside the rail. The rail holds
          the budget and the add-a-question form, which belong next to the
          chart. space-y-5 because they were a stack inside that column and
          still are; losing it on the way out is what left them touching. */}
      <div className="mt-5 space-y-5">
        {/* Which of our own pages earned the citations.

            The actionable half. "You were cited five times" is a score; "this
            page was cited five times" is an instruction — it says which piece
            of content is doing the work and therefore what to write more of.
            Costs nothing to show: the full URLs were already stored on every
            check. */}
        {citedPages.length > 0 && (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                icon={<DocIcon className="h-4 w-4" />}
                tint="bg-success/12 text-success-ink"
              >
                Your pages the AI links to
              </SectionTitle>
              <Badge tone="success">{citedPages.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              The pages AI sent people to. Write more like these.
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

        {/* ⚠️ "Who the AI reads instead" MOVED TO /dashboard/competitors, WHOLE.

            It was the last card on this page, under the evidence and the
            per-engine summary, which made the answer to "then who IS it
            naming?" something you had to scroll past three other things to
            reach. It is its own nav destination now, and the measured list
            went across unchanged — same ranking, same counts, same rule that
            your own row survives the cut whatever its rank. */}
      </div>

      <p className="text-slate mt-6 text-center text-xs">
        We asked: {ENGINES.join(' · ')}
      </p>
    </>
  );
}
