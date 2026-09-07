import type { Competitor } from './types';

/**
 * The order of the watch list.
 *
 * Starred first, then whoever AI mentions most, then alphabetically.
 *
 * ⚠️ ONE RULE, AND IT REPLACED A HAND-SET `position`. The list used to be
 * ordered by up/down arrows, which meant the order carried no information —
 * every rival looked the same whether AI cited them twelve times or never, in
 * whatever sequence they happened to be typed. Stars are the owner's opinion,
 * the mention count is the measurement, and between them there is nothing left
 * for a third rule to decide.
 *
 * ⚠️ EXTRACTED RATHER THAN INLINED IN THE .sort() CALL. The fixture's watch list
 * is empty on purpose — the seed's note explains that seeding it would blur the
 * distinction between the named list and the measured one — so the screen cannot
 * exercise this. A pure function can be tested directly, and this is the part
 * that has to be right.
 *
 * ⚠️ ZERO IS A READING, AND SORTING MUST NOT HIDE IT. A watched rival AI has
 * never cited sorts last and still renders a real "0" — that absence is the
 * finding the owner asked for by adding them, so it belongs at the bottom of the
 * list rather than out of it.
 */
export function compareWatched(
  a: Competitor,
  b: Competitor,
  mentions: (c: Competitor) => number,
): number {
  if (a.starred !== b.starred) return a.starred ? -1 : 1;

  const byMentions = mentions(b) - mentions(a);
  if (byMentions !== 0) return byMentions;

  /* ⚠️ A TOTAL ORDER, NOT A TIE. Two rivals on the same count would otherwise
     depend on the array order they arrived in, which changes as rows are added
     and removed — so the list would quietly reshuffle for no visible reason. */
  return a.name.localeCompare(b.name);
}

/**
 * The watch list, ordered, without mutating what was handed in.
 *
 * ⚠️ [...list] BECAUSE .sort() SORTS IN PLACE. The array here comes straight
 * off the provider's memo, and sorting it where it lies would reorder the
 * snapshot every other reader shares.
 */
export function sortWatched(
  list: Competitor[],
  mentions: (c: Competitor) => number,
): Competitor[] {
  return [...list].sort((a, b) => compareWatched(a, b, mentions));
}
