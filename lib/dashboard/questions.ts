import type { CitationCheck } from './types';

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
