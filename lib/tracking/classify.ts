import 'server-only';

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

/** Bare host: no scheme, no `www.`, no port, lowercased. */
function host(value: string): string | null {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

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

function mentionsName(text: string, name: string): boolean {
  if (!nameIsDistinctive(name)) return false;

  // Collapse whitespace on both sides so a line break inside the name in the
  // answer doesn't hide it.
  const haystack = text.toLowerCase().replace(/\s+/g, ' ');
  const needle = name.toLowerCase().replace(/\s+/g, ' ').trim();

  return needle.length > 0 && haystack.includes(needle);
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

  const excerpt = answer.text.slice(0, MAX_EXCERPT_CHARS);

  // A domain we can't parse can't be matched against anything. Recording
  // `absent` would be a claim we haven't earned, so nothing is claimed: no
  // outcome is better than a wrong one, and the run reports the gap.
  if (!ours) return { outcome: 'absent', citedInstead: null, excerpt };

  if (answer.sources.some((s) => isOurs(s, ours))) {
    return { outcome: 'cited', citedInstead: null, excerpt };
  }

  if (mentionsName(answer.text, site.name)) {
    // Named but not linked. Still worth knowing who took the click.
    return { outcome: 'mentioned', citedInstead: citedInstead(answer.sources, ours), excerpt };
  }

  return { outcome: 'absent', citedInstead: citedInstead(answer.sources, ours), excerpt };
}
