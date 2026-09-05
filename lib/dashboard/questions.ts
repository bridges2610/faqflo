import { ENGINES, type CitationCheck, type DiscoveredQuestion, type Engine } from './types';

/**
 * A question that is still work: nobody has answered it and nobody has waved
 * it away.
 *
 * ⚠️ ONE PREDICATE, BECAUSE FIVE SCREENS COUNT THIS AND THEY MUST AGREE. Home's
 * tile, the worklist, the audit's action list and the Answers page all render
 * "N questions you don't answer", and before Ignore existed each did its own
 * `!q.covered`. A dismissed question is not work, so every one of those counts
 * had to learn the second half of the rule at the same moment — the failure
 * otherwise is silent and looks like the Ignore button doing nothing.
 *
 * `dismissed` is optional on the type (rows predate the column), and absent
 * means not dismissed.
 */
export function isOpenQuestion(q: DiscoveredQuestion): boolean {
  return !q.covered && !q.dismissed;
}

/*
  One question, and every engine's answer to it.

  This transform lived inline in components/dashboard/tracking-workspace.tsx and
  nowhere else. It moved here when Home grew a per-question breakdown of its
  own: two implementations of the same grouping are free to drift apart, and the
  two screens would then disagree about how many questions a customer has and
  how many of them name them — which is the sort of disagreement nobody reports,
  they just stop trusting the numbers.
*/

/** Every check we hold for one question. */
export type QuestionGroup = {
  question: string;
  checks: CitationCheck[];
  /** Most recent sighting across the group — what "2 days ago" should mean. */
  checkedAt: string;
  sources: number;
};

/**
 * Group deduped checks by the question they answer.
 *
 * ⚠️ GROUPED, BUT NOTHING IS MERGED. The row-per-engine layout this replaced was
 * deliberate: each check carries its own answer, its own source list and its own
 * `citedInstead`, and a summary row that flattened them would throw two of the
 * three away. So the group is a container, never a summary — callers name each
 * engine separately and keep all three answers whole and apart. Flatten any of
 * that and the original objection is right again.
 *
 * The comparison is the reason three engines get asked at all: being cited by
 * Perplexity and absent from ChatGPT on the same question is one finding, and it
 * was previously spread across three rows a customer had to hunt for.
 *
 * ⚠️ FEED IT `latest`, NEVER THE RAW LOG. `latest` is deduped to one row per
 * (question, engine) — see the note on it in lib/dashboard/store.ts. Handing
 * this the full history would put the same question in the list once per run and
 * inflate every count derived from it.
 *
 * ⚠️ A GROUP CAN BE SHORT OF A CHECK. An engine can fail on its own — a 429
 * during a run — so `checks.length` is not always ENGINES.length. Anything
 * dividing by it must use that group's own length rather than assuming three,
 * and anything looking for a specific engine must handle not finding one.
 *
 * Insertion order is preserved, and `latest` arrives `checked_at desc`, so the
 * result is newest-first.
 */
export function groupByQuestion(latest: CitationCheck[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
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

  return groups;
}

/**
 * Every engine, in ENGINES order, with its check or `null`.
 *
 * ⚠️ ENGINES ORDER, NOT `checks` ORDER, AND THAT IS THE WHOLE POINT. A group
 * holds however many rows a run produced, in whatever order they were stored.
 * Rendering `group.checks` directly gives a matrix whose columns move from row
 * to row — the one thing a grid must never do. Mapping over ENGINES fixes the
 * column and lets the missing engine fall out as `null`.
 *
 * ⚠️ AND `null` IS A GAP, NOT A NO — the same rule cellFor states below. A
 * group can be short of a check when an engine 429s mid-run, so callers must
 * render that as "not checked" and never as "absent".
 *
 * Lived inline in tracking-workspace.tsx while the row of pills was its only
 * consumer. The matrix and the expanded detail both need the identical mapping,
 * and three copies of "find this engine, or null" is how a screen ends up
 * disagreeing with itself about which engine a column belongs to.
 */
export function checksByEngine(group: QuestionGroup): { engine: Engine; check: CitationCheck | null }[] {
  return ENGINES.map((engine) => ({
    engine,
    check: group.checks.find((c) => c.engine === engine) ?? null,
  }));
}

/**
 * Did any engine name this business on this question?
 *
 * ⚠️ NAMED MEANS CITED **OR** MENTIONED. A mention is being named at all,
 * linked or not, so it INCLUDES the citations — the note on `mentions` in
 * components/dashboard/tracking-workspace.tsx sets that out. Reading the two as
 * rivals is the mistake this helper exists to stop each caller making
 * separately.
 */
export function namedIn(group: QuestionGroup): number {
  return group.checks.filter((c) => c.outcome === 'cited' || c.outcome === 'mentioned').length;
}

/** How many engines linked to you on this question. Citations only — see namedIn. */
export function citedIn(group: QuestionGroup): number {
  return group.checks.filter((c) => c.outcome === 'cited').length;
}

/**
 * Best results first: most citations, then most mentions.
 *
 * ⚠️ IT COPIES. groupByQuestion's output is read for counts elsewhere on the
 * same render, and sorting in place would reorder those callers' data
 * underneath them.
 *
 * ⚠️ THE SECOND KEY IS namedIn, WHICH INCLUDES THE CITATIONS. That is what
 * makes it a tiebreak rather than a second opinion: rows are already equal on
 * citations by the time it is consulted, so what it actually ranks is the
 * mentions among them.
 *
 * Array.prototype.sort is stable, so questions that tie on both keep the
 * newest-first order groupByQuestion produced.
 */
export function sortByCitations(groups: QuestionGroup[]): QuestionGroup[] {
  return [...groups].sort((a, b) => citedIn(b) - citedIn(a) || namedIn(b) - namedIn(a));
}

/**
 * What one engine did on one question.
 *
 * ⚠️ `null` IS A GAP, NOT A NO, AND EVERY CALLER MUST KEEP THEM APART. An
 * engine can fail on its own — a 429 mid-run — and that question simply has no
 * row for it. Rendering the absence as "did not name you" claims we asked and
 * were refused; we did not ask. components/dashboard/engine-outcome.tsx is
 * where that distinction becomes pixels, and Results states the same rule for
 * its NOT_CHECKED pill.
 *
 * ⚠️ NAMED MEANS CITED **OR** MENTIONED, matching namedIn above. The two must
 * agree or a question can be "named" by one and not the other.
 *
 * Lived in prompt-ranking.tsx until the plan page needed the same reading of
 * the same data. It is a pure function over a QuestionGroup with nothing
 * presentational in it, so it belongs beside groupByQuestion rather than in
 * whichever component happened to need it first.
 */
export function cellFor(group: QuestionGroup, engine: Engine): EngineOutcome {
  const check = group.checks.find((c) => c.engine === engine);
  if (!check) return null;
  return check.outcome === 'cited' || check.outcome === 'mentioned' ? 'named' : 'absent';
}

/** What one engine did, or `null` when it was never asked. */
export type EngineOutcome = 'named' | 'absent' | null;

/**
 * Who the engines pointed at instead, for one prompt.
 *
 * ⚠️ NO CATEGORY CLAIMED. `citedInstead` is the top source in the engine's own
 * ranking that is not the customer's domain, which is a lead-generation
 * directory at least as often as it is a rival business — so surfaces call this
 * "named instead" and render a bare domain. proof-card.tsx carries the long
 * form of this warning; calling these "competitors" would be confidently wrong
 * on a large share of local-services accounts.
 */
export function insteadFor(group: QuestionGroup): string | null {
  return group.checks.find((c) => c.outcome !== 'cited' && c.citedInstead)?.citedInstead ?? null;
}

/* ------------------------------------------------------ the watch list --- */

/**
 * One row of the question list, as far as choosing a watch list cares.
 *
 * ⚠️ `source` ALLOWS undefined AS WELL AS null, BECAUSE THE TWO CALLERS DISAGREE
 * ABOUT ABSENCE. The scan reads a Postgres row, where a missing source is
 * `null`; the browser holds DiscoveredQuestion, where it is an optional field
 * and so `undefined`. Both mean "not typed by a person", and the test below is
 * `=== 'manual'`, so either lands on the discovered side without a coercion at
 * the call site.
 */
export type WatchCandidate = { question: string; source?: string | null };

/**
 * Which of a site's questions actually get asked.
 *
 * ⚠️ IT LIVES HERE, NOT IN lib/scan/run.ts, AND THAT IS A BUG FIX RATHER THAN
 * TIDYING. The scan is `server-only`, so AI Mentions could not import this and
 * open-coded its own boundary as `ordered.slice(promptCap)`. When promptCap went
 * from 3 to 4 to make room for a typed question, the screen quietly stopped
 * blurring the fourth row while the scan carried on asking three — the two
 * disagreed for as long as there were two copies. Both import this now.
 *
 * ⚠️ MANUAL FIRST. A question the customer types is created with
 * `position: mine.length` — 15 on a free account, because the scan stores the
 * model's whole list at the Pro ceiling — so a plain "top N by position" would
 * leave it permanently below the cut. lib/dashboard/plans.ts states the standard
 * that makes that unacceptable: "a field that accepts a typed question and then
 * never checks it is worse than no field".
 *
 * ⚠️ A MANUAL QUESTION ADDS A SLOT, IT DOES NOT TAKE ONE. The caps are enforced
 * separately on purpose: `manualCap` bounds what a person may type,
 * `discoveredCap` bounds what the model may contribute, and `promptCap` is only
 * the ceiling on the two together. Free is 3 discovered plus 1 typed, capped
 * at 4.
 *
 * ⚠️ DISCOVERED IS CAPPED AT discoveredCap, NOT AT "WHATEVER MANUAL LEFT OVER",
 * AND THE DIFFERENCE IS A BILL. Filling discovered up to `promptCap - manual`
 * would give an account that typed nothing FOUR discovered prompts — spending
 * the raised ceiling on every free signup, whether or not the feature it was
 * raised for was ever used.
 *
 * ⚠️ PURE, AND `rows` MUST ARRIVE IN position ORDER. It does no sorting of its
 * own — the caller's ordering is what makes "best discovered" mean anything.
 */
export function pickWatchList(
  rows: WatchCandidate[],
  plan: { promptCap: number; manualCap: number; discoveredCap: number },
): string[] {
  const seen = new Set<string>();

  const take = (list: WatchCandidate[], limit: number) => {
    const out: string[] = [];
    for (const row of list) {
      if (out.length >= limit) break;
      if (!row.question || seen.has(row.question)) continue;
      seen.add(row.question);
      out.push(row.question);
    }
    return out;
  };

  const manual = take(
    rows.filter((r) => r.source === 'manual'),
    plan.manualCap,
  );

  /* `discoveredCap`, and then promptCap as the ceiling on the pair. Both are
     needed: the first stops a fourth discovered prompt appearing on an account
     that typed nothing, the second is what the budget is priced against. */
  const discovered = take(
    rows.filter((r) => r.source !== 'manual'),
    Math.min(plan.discoveredCap, Math.max(0, plan.promptCap - manual.length)),
  );

  return [...manual, ...discovered];
}
