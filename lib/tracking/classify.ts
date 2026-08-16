import 'server-only';

import { sourceHost } from '@/lib/dashboard/domain';
import type { CitationCheck } from '@/lib/dashboard/types';
import { MAX_EXCERPT_CHARS, type EngineAnswer } from './types';

/*
  Turning one engine answer into one outcome.

  ⚠️ NO MODEL DECIDES THIS.

  It would be easy to hand the answer to Claude and ask "was this business
  mentioned?" — and it would cost money per check, add latency to a run that is
  already the slowest thing in the product, and introduce a second thing that
  can be wrong about the number we put our name to. Domain matching is exact and
  free. The only genuinely fuzzy part is the name match, and it is deliberately
  built to under-report (see below).

  The three outcomes are not a scale. `mentioned` is not a weaker `cited`; it is
  a different and specific problem — an assistant that knows who you are but
  sends the click elsewhere. The type comment in lib/dashboard/types.ts makes
  the same point, and the dashboard counts them separately.
*/

/*
  Bare host: no scheme, no `www.`, no port, lowercased.

  Imported rather than defined here so the dashboard's share-of-voice ranking
  and this classifier cannot disagree about what one publisher is. See the note
  on sourceHost — a pure module, so pulling it into a `server-only` file drags
  nothing along with it.
*/
const host = sourceHost;

/**
 * Does this source belong to the site?
 *
 * Subdomains count — `blog.example.com` is still them, and a citation of their
 * own blog is a citation. A suffix match alone would also accept
 * `notexample.com`, so the boundary dot is required.
 */
function isOurs(source: string, ours: string): boolean {
  const candidate = host(source);
  if (!candidate) return false;
  return candidate === ours || candidate.endsWith(`.${ours}`);
}

/**
 * Words too generic to prove a business was named.
 *
 * A company called "Roofing Services" would otherwise be "mentioned" in every
 * answer about roofing ever written, and the dashboard would report a number
 * that means nothing. Matching the full name is the test; these are the tokens
 * that make a full name worthless on its own.
 */
const GENERIC = new Set([
  'roofing',
  'plumbing',
  'services',
  'service',
  'company',
  'group',
  'solutions',
  'contractors',
  'contractor',
  'construction',
  'the',
  'and',
  'llc',
  'inc',
  'co',
]);

/**
 * Is this name specific enough that finding it in prose means something?
 *
 * ⚠️ THE ASYMMETRY HERE IS ON PURPOSE. A missed mention understates a customer's
 * visibility, which is disappointing. A false mention tells them an assistant is
 * naming them when it is not — and that is the number they would make decisions
 * on, and the kind of invented figure this codebase refuses to print elsewhere
 * (see the ban on ask-volume in lib/questions.ts). When in doubt, do not claim
 * the mention.
 */
function nameIsDistinctive(name: string): boolean {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const distinctive = words.filter((w) => w.length > 2 && !GENERIC.has(w));

  // One distinctive word is enough when it's a real word ("Segelman"), but a
  // bare generic pair ("Roofing Services") is not a name we can find in prose.
  return distinctive.length > 0;
}

/**
 * The ways this business might be named in prose.
 *
 * ⚠️ A FULL LEGAL NAME IS ALMOST NEVER WHAT AN ASSISTANT WRITES. Matching only
 * the stored string meant "Segelman Shaw Roofing, Siding & Gutters" had to
 * appear verbatim — so an answer saying "Segelman Shaw" counted as `absent`,
 * and the customer was undercounted against their own results.
 *
 * ⚠️ EVERY ALIAS STILL GOES THROUGH nameIsDistinctive. This widens what we
 * recognise, never what we will claim: dropping the trade words from "Roofing
 * Services" leaves nothing distinctive, so it yields no alias at all rather
 * than one that matches every roofing answer ever written. The asymmetry below
 * is the whole point and must survive any edit here.
 *
 * The domain brand is included because plenty of businesses are known by it
 * ("letsroof"), and it is the one name we always have.
 */
function aliasesFor(name: string, domain: string): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    const cleaned = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (cleaned.length > 2 && nameIsDistinctive(cleaned) && !out.includes(cleaned)) {
      out.push(cleaned);
    }
  };

  add(name);

  /*
    The distinctive core: the LEADING RUN of words, stopping at the first one
    that describes a trade.

    "Segelman Shaw Roofing, Siding & Gutters" -> "segelman shaw".

    ⚠️ A leading run, not "every non-generic word". Filtering the whole string
    would keep "siding" and "gutters" — they are not in GENERIC and never can be,
    since no list of trade words is complete — and join them into
    "segelman shaw siding gutters", a phrase nobody writes. The run stops where
    the business's name stops and the description of its trade begins, which is
    how English company names are built.

    ⚠️ TWO WORDS MINIMUM. A one-word core would put "Advanced" or "Premier" into
    the matcher and find them in prose that has nothing to do with this
    customer. Single-word names are still matched in full and by their domain
    brand — narrower than we could be, which is the correct direction to err.
  */
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const leading: string[] = [];
  for (const word of words) {
    if (GENERIC.has(word) || word.length <= 2) break;
    leading.push(word);
  }
  if (leading.length >= 2) add(leading.join(' '));

  // The domain brand, without its TLD.
  const bare = host(domain);
  if (bare) add(bare.split('.')[0]);

  return out;
}

function mentionsName(text: string, name: string, domain: string): boolean {
  // Collapse whitespace on both sides so a line break inside the name in the
  // answer doesn't hide it.
  const haystack = text.toLowerCase().replace(/\s+/g, ' ');

  return aliasesFor(name, domain).some((alias) => haystack.includes(alias));
}

/**
 * Who got cited instead of us.
 *
 * The engine's own first source, skipping anything of ours. Order is the
 * engine's ranking, not ours — see the note on EngineAnswer.sources.
 */
function citedInstead(sources: string[], ours: string): string | null {
  for (const source of sources) {
    const candidate = host(source);
    if (candidate && !isOurs(source, ours)) return candidate;
  }
  return null;
}

/**
 * The stored slice of an answer, cut on a word boundary.
 *
 * A bare `slice(0, MAX_EXCERPT_CHARS)` stops mid-word — a real row ends
 * "**Open n" — which reads as a broken record rather than a deliberate excerpt.
 * Backing up to the last space and adding an ellipsis costs a few characters and
 * makes the shortening legible.
 *
 * ⚠️ Never longer than MAX_EXCERPT_CHARS: the ellipsis replaces text, it does
 * not extend past the cap the column was sized for.
 *
 * ⚠️ Not retroactive. Rows already stored were cut mid-word and the rest of the
 * answer was never kept, so they cannot be repaired — the Results page labels
 * them instead.
 */
export function excerptOf(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) return text;

  const cut = text.slice(0, MAX_EXCERPT_CHARS - 1);
  const lastSpace = cut.lastIndexOf(' ');

  // A 600-character run with no space in it is not prose — keep the hard cut
  // rather than throwing the whole excerpt away chasing a boundary.
  const body = lastSpace > MAX_EXCERPT_CHARS / 2 ? cut.slice(0, lastSpace) : cut;

  return `${body.trimEnd()}…`;
}

export type Classified = {
  outcome: CitationCheck['outcome'];
  citedInstead: string | null;
  excerpt: string;
};

/**
 * One answer, one verdict.
 *
 * `site.domain` is the stored domain, which deliberately keeps `www.` — see
 * lib/dashboard/domain.ts. It is normalised to a bare host here because a
 * source list will contain both forms and neither is more correct.
 */
export function classify(
  answer: EngineAnswer,
  site: { domain: string; name: string },
): Classified {
  const ours = host(site.domain);

  const excerpt = excerptOf(answer.text);

  // A domain we can't parse can't be matched against anything. Recording
  // `absent` would be a claim we haven't earned, so nothing is claimed: no
  // outcome is better than a wrong one, and the run reports the gap.
  if (!ours) return { outcome: 'absent', citedInstead: null, excerpt };

  if (answer.sources.some((s) => isOurs(s, ours))) {
    return { outcome: 'cited', citedInstead: null, excerpt };
  }

  if (mentionsName(answer.text, site.name, site.domain)) {
    // Named but not linked. Still worth knowing who took the click.
    return { outcome: 'mentioned', citedInstead: citedInstead(answer.sources, ours), excerpt };
  }

  return { outcome: 'absent', citedInstead: citedInstead(answer.sources, ours), excerpt };
}
