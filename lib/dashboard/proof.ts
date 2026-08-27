import { ENGINES, type CitationCheck } from './types';
import { sourceHost } from './domain';

/*
  Choosing the one answer the Free page is built around.

  That page makes a single argument — here is a real question, here is what the
  engine really said, here is who it named instead — and it needs exactly one
  check to make it with. Nothing else in this product picks a representative
  row: Results shows every check and lets the reader filter, which is the right
  answer for a page somebody is studying and the wrong one for a page that has
  to land a point in four seconds.

  ⚠️ DETERMINISTIC, AND NOT BY DATE. The obvious tie-break is "most recent",
  and it does not work here: one tracking run writes every row within seconds of
  the others, so `checkedAt` orders them arbitrarily and the page would show a
  different quote on each reload. Sorting on the question text and then on
  ENGINES order gives a stable answer that only changes when the data does.

  ⚠️ IT MAY RETURN NULL, AND THE CALLER MUST HANDLE THAT RATHER THAN FILLING IN.
  `excerpt` is null on rows written before the column was populated, and a check
  with no answer text cannot carry this page. Returning null so the section
  disappears is right; substituting a different section's data would be the
  page quietly changing its argument.
*/

export type Proof = {
  check: CitationCheck;
  /** Non-null only when the engine cited somebody who isn't us. */
  citedInstead: string | null;
};

/** Stable ordering: question, then the fixed ENGINES order. */
function ranked(checks: CitationCheck[]): CitationCheck[] {
  return [...checks].sort(
    (a, b) =>
      a.question.localeCompare(b.question) ||
      ENGINES.indexOf(a.engine) - ENGINES.indexOf(b.engine),
  );
}

/**
 * The check the proof section should show.
 *
 * Preference order, all within rows that actually have answer text:
 *
 *   1. Not named, and the engine cited somebody else — the strongest version of
 *      the argument, because there is a name to put beside the quote.
 *   2. Not named, nobody else identifiable either — still the argument, minus
 *      the chip.
 *   3. Named — a different page, and a better one. The caller flips the
 *      verdict and the framing rather than hunting for a loss to show.
 */
export function pickProof(latest: CitationCheck[]): Proof | null {
  const usable = ranked(latest.filter((c) => c.excerpt && c.excerpt.trim()));
  if (usable.length === 0) return null;

  const lostToSomeone = usable.find((c) => c.outcome === 'absent' && c.citedInstead);
  if (lostToSomeone) return { check: lostToSomeone, citedInstead: lostToSomeone.citedInstead };

  const lost = usable.find((c) => c.outcome === 'absent');
  if (lost) return { check: lost, citedInstead: null };

  const named = usable.find((c) => c.outcome === 'cited' || c.outcome === 'mentioned');
  if (named) return { check: named, citedInstead: null };

  return { check: usable[0], citedInstead: usable[0].citedInstead };
}

/**
 * Does this link point at the domain that got cited instead of us?
 *
 * Used to mark the rival's own link inside the quoted answer.
 *
 * ⚠️ LINKS ONLY, AND THAT LIMIT IS THE DATA'S, NOT A SHORTCUT. `citedInstead`
 * is a host — `angi.com` — taken from the engine's source list, not a business
 * name lifted from the prose. So a rival the engine merely NAMED, without
 * linking, cannot be found in the text by anything we store. The page states
 * who was cited in a chip beside the quote for exactly that reason: the chip is
 * always right, and the highlight is a bonus when the engine happened to link.
 *
 * Subdomains count, matching isOurs() in lib/tracking/classify.ts — a citation
 * of `www.angi.com` and one of `angi.com` are the same rival.
 */
export function linkIsRival(href: string, citedInstead: string | null): boolean {
  if (!citedInstead) return false;
  const host = sourceHost(href);
  if (!host) return false;
  return host === citedInstead || host.endsWith(`.${citedInstead}`);
}
