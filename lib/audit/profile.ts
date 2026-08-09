/**
 * Who the business is, read off its own pages.
 *
 * The Content page needs an industry and a service area to say anything useful:
 * "write about roof financing in Rockland County" is worth reading, "write
 * about your services" is not. There are three places that could come from, and
 * this file covers the two free ones.
 *
 * Schema first, because it's the business's own statement of what it is —
 * LocalBusiness markup already carries a type, an address and often an
 * areaServed, and a site that publishes it has told us the answer directly. No
 * inference beats being told.
 *
 * When there's no markup — which is most small sites, and exactly the sites
 * this product is for — we fall back to letting an LLM read the homepage. That
 * happens later, on the Content route; what this file does is prepare the text
 * for it. The alternative was storing the whole entry page, which would put
 * a couple of hundred kilobytes into localStorage per site to answer two
 * questions.
 */

import { findNode, schemaNodes, type PageFacts } from './parse';
import type { BusinessProfile } from './types';
import { allPages, type FetchedPage, type PageSet } from './fetcher';

/**
 * Enough of the entry page for someone to say what this business does.
 *
 * Sized against the cost of being wrong in either direction: too little and an
 * LLM guesses "a services company"; too much and we're paying to send a
 * navigation menu. Title, description and headings carry most of the signal,
 * so the paragraphs are what gets truncated.
 */
const MAX_HINT_CHARS = 1500;

/** Same node the citation checks look for — one definition of "the business". */
const ORG_TYPE = /^(Organization|LocalBusiness|.*Business|Store|Restaurant)$/;

/** Schema.org types that say "business" without saying which kind. */
const VAGUE_TYPE = /^(Organization|LocalBusiness)$/;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * A readable industry from an @type.
 *
 * Schema.org spells its business types in PascalCase — `RoofingContractor`,
 * `HVACBusiness` — which is genuinely specific and worth having. `Organization`
 * and `LocalBusiness` are not: they're the base types every site inherits, and
 * treating them as an industry would put "Local Business" on screen as though
 * we'd learned something. Those return null so the LLM fallback runs instead.
 */
function industryFromType(node: Record<string, unknown>): string | null {
  const raw = node['@type'];
  const types = (Array.isArray(raw) ? raw : [raw]).filter(
    (t): t is string => typeof t === 'string',
  );

  const specific = types.find((t) => ORG_TYPE.test(t) && !VAGUE_TYPE.test(t));
  if (!specific) return null;

  // RoofingContractor -> Roofing contractor
  const words = specific.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/**
 * Where the business works.
 *
 * `areaServed` is preferred over `address` on purpose: a contractor's address
 * is one town, and the area they'll actually drive to is the thing a customer
 * searches on. Falls back to locality + region when only an address is given.
 */
function locationFrom(node: Record<string, unknown>): string | null {
  const area = node.areaServed;
  const areas = (Array.isArray(area) ? area : [area])
    .map((a) => {
      if (typeof a === 'string') return a.trim();
      if (a && typeof a === 'object') return text((a as Record<string, unknown>).name);
      return null;
    })
    .filter((a): a is string => Boolean(a));

  if (areas.length) return areas.slice(0, 3).join(', ');

  const address = node.address;
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>;
    const parts = [text(a.addressLocality), text(a.addressRegion)].filter(Boolean);
    if (parts.length) return parts.join(', ');
  }

  return null;
}

/**
 * The business profile from structured data, or nulls when there is none.
 *
 * Always returns an object rather than null — `source: 'schema'` with null
 * fields is a meaningful answer ("we looked, they publish nothing"), and it
 * saves every caller a branch.
 */
export function businessProfile(set: PageSet): BusinessProfile {
  const nodes = schemaNodes(allPages(set).flatMap((p) => p.facts.schemaRaw));
  const org = findNode(nodes, ORG_TYPE);

  if (!org) return { name: null, industry: null, location: null, source: 'schema' };

  return {
    name: text(org.name),
    industry: industryFromType(org),
    location: locationFrom(org),
    source: 'schema',
  };
}

/** True once we know enough to skip asking an LLM. */
export function profileIsUsable(profile: BusinessProfile | undefined): boolean {
  return Boolean(profile?.industry && profile.location);
}

/**
 * The entry page, compressed to what identifies the business.
 *
 * Ordered by how much each part tends to give away: the title and meta
 * description are written to say what the company does, headings say what it
 * sells, and the body prose is where a service area usually appears. The cap
 * lands on the prose because it's last.
 */
export function profileHint(entry: FetchedPage): string {
  const f: PageFacts = entry.facts;

  const parts = [
    f.title && `Title: ${f.title}`,
    f.metaDescription && `Description: ${f.metaDescription}`,
    f.headings.length &&
      `Headings: ${f.headings
        .filter((h) => h.level <= 3)
        .slice(0, 10)
        .map((h) => h.text)
        .join(' | ')}`,
    f.paragraphs.length && `Page text: ${f.paragraphs.slice(0, 6).join(' ')}`,
  ].filter(Boolean);

  return parts.join('\n').slice(0, MAX_HINT_CHARS);
}
