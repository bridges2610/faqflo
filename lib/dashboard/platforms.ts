/**
 * Domains that are not a business like yours.
 *
 * The Competitors page ranks every website the engines cited. On a
 * local-services account the top of that list is reddit.com, yelp.com and
 * angi.com, and the actual rival roofer is below the fold. Three places in this
 * codebase already say the same thing in prose — a cited source "is a
 * lead-generation directory at least as often as it is a rival business"
 * (questions.ts, proof-card.tsx, prompt-ranking.tsx) — and nothing acted on it.
 * This is the list that acts on it.
 *
 * ⚠️ AN EXPLICIT LIST, NOT A HEURISTIC, AND THAT IS THE WHOLE DESIGN. There is
 * no "looks like a big site" rule here, because we do not measure traffic,
 * domain authority or page count, and a guess dressed as a measurement is the
 * one thing this product refuses to ship. Every entry below is a judgement
 * somebody made and can be argued with by name.
 *
 * ⚠️ ANYTHING UNKNOWN IS A BUSINESS. The two mistakes are not equal. A
 * directory filed as a rival is untidy — it sits in a list the reader is
 * scanning anyway. A rival filed as a directory is HIDDEN inside a collapsed
 * group, on the page whose entire job is to show you who is beating you. So the
 * default is always 'business', and this list only ever demotes.
 *
 * ⚠️ NOTHING IS DELETED ON THE STRENGTH OF THIS. The platform group keeps its
 * rows, its counts and its place in the totals. "You are losing to directories
 * rather than to rivals" is a finding worth reading, not noise to suppress.
 */

/**
 * Matched as the host itself or any subdomain of it, so `en.wikipedia.org` and
 * `maps.google.com` are both caught by their bare entry.
 *
 * ⚠️ NO `www.` PREFIXES HERE. sourceHost() in domain.ts has already stripped
 * it — that is the documented difference between it and normalizeDomain — so
 * an entry written as `www.yelp.com` would never match anything.
 */
const PLATFORMS: readonly string[] = [
  /* Forums, social and user-generated. Cited constantly for local-services
     questions, and never a business the reader competes with. */
  'reddit.com',
  'quora.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'linkedin.com',
  'pinterest.com',
  'nextdoor.com',
  'medium.com',
  'substack.com',

  /* Reference. */
  'wikipedia.org',
  'wikihow.com',

  /* Lead-generation directories and review sites. The category the customer is
     most often actually losing to, which is exactly why it gets its own group
     rather than being thrown away. */
  'yelp.com',
  'angi.com',
  'angieslist.com',
  'homeadvisor.com',
  'thumbtack.com',
  'porch.com',
  'houzz.com',
  'bbb.org',
  'buildzoom.com',
  'networx.com',
  'manta.com',
  'yellowpages.com',
  'superpages.com',
  'bark.com',
  'checkatrade.com',
  'trustpilot.com',
  'tripadvisor.com',
  'foursquare.com',
  'mapquest.com',
  'nicelocal.com',
  'chamberofcommerce.com',

  /* Big-box retail. Genuinely cited for trade questions — "how much does a roof
     cost" pulls homedepot.com — but not a local rival, which is what this page
     is asking about. */
  'amazon.com',
  'homedepot.com',
  'lowes.com',
  'menards.com',
  'walmart.com',

  /* Google's own surfaces, which cite themselves. */
  'google.com',
  'goo.gl',
  'blogspot.com',
];

export type SourceKind = 'business' | 'platform';

/**
 * Which kind of source a cited host is.
 *
 * Expects the output of `sourceHost()` — a bare, lowercased host with `www.`
 * already removed. The subdomain rule mirrors the `isOurs` test in
 * lib/dashboard/store.ts (`host === x || host.endsWith('.' + x)`) so one
 * publisher is counted one way in both places.
 */
export function sourceKind(host: string): SourceKind {
  const bare = host.toLowerCase();
  return PLATFORMS.some((entry) => bare === entry || bare.endsWith(`.${entry}`))
    ? 'platform'
    : 'business';
}
