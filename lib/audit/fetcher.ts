/**
 * Building the page set the audit reasons over.
 *
 * The page count is a BUDGET, NOT A GOAL. On a site with 340 pages and a
 * budget of 100, which 100 get read decides whether the audit is about the site
 * or about an arbitrary corner of it. So this is a best-first crawl over a
 * scored frontier rather than "follow links until the counter runs out":
 * every candidate URL carries a score, and the highest-scoring unread URL is
 * always next.
 *
 * Every fetch goes through the same SSRF guard as the entry URL, and that
 * matters far more at a hundred pages than at five — almost every URL here came
 * out of somebody else's markup, so without the guard a hostile page could
 * point us at a private address and use our server as a probe.
 */

import { parsePage, type PageFacts } from './parse';
import { safeFetch, type FetchFailure, type FetchResult } from './safe-fetch';
import type { CrawledPage } from './types';

/*
  ⚠️ FetchFailure MOVED TO ./safe-fetch.ts AND IS RE-EXPORTED HERE.

  It had to follow the function that produces it — this module now imports
  safeFetch, so a type living here that safe-fetch.ts also needed would have
  made the two import each other. Re-exported rather than relocated in the
  callers' imports so app/api/audit/route.ts and everything else that already
  says `from '@/lib/audit/fetcher'` keeps working.
*/
export type { FetchFailure } from './safe-fetch';

// The per-request timeout moved to ./safe-fetch.ts with the fetch itself. One
// definition, so the audit and the page reader cannot drift apart on it.
const CONCURRENCY = 6;
/**
 * We identify as ourselves, not as a browser.
 *
 * This used to read `Mozilla/5.0 (compatible; FaqFlo-Audit/1.0; ...)`, and that
 * disguise was actively costing us pages: WAFs fingerprint the
 * `Mozilla/5.0 (compatible; <bot>)` shape and 403 it, while the same hosts
 * serve the honest string fine. letsroof.com is the worked example — SiteGround
 * returned a 403 interstitial to the masquerade and the real page to this.
 * Claiming to be Chrome fares no better; the point isn't to look human.
 *
 * The `+url` also means a site owner reading their logs can find out who we are
 * and choose, which is the only basis on which we should expect to be let in.
 */
const UA = 'FaqFlo-Audit/1.0 (+https://faqflo.com)';

/** Default ceilings. The caller passes the real ones from the plan. */
export const DEFAULT_MAX_PAGES = 1;
export const DEFAULT_MAX_MS = 60_000;

export type CrawlBudget = { maxPages: number; maxMs: number };

export type FetchedPage = CrawledPage & { html: string; facts: PageFacts };

/**
 * Why we couldn't read a page.
 *
 * This exists because "we got nothing back" is not one thing, and the audit was
 * reporting it as one: a firewall turning us away and a mistyped address
 * produced the same sentence, and only one of them is the user's fault. The
 * kinds below are the distinctions worth making to somebody who just wants to
 * know whether to fix their typing, call their host, or wait.
 *
 * Only the entry page carries one. A page that fails mid-crawl is dropped
 * quietly, as it always was — one unreachable link out of a hundred is not
 * something to interrupt a report for.
 */
export type PageSetResult = { ok: true; set: PageSet } | { ok: false; failure: FetchFailure };

/**
 * The HTTP status behind a result, successful or not.
 *
 * The 404 probe needs this: a non-2xx response is the *expected* answer there,
 * and the status is the finding. Null means we never got one at all — timeout,
 * dead host — which is not the same as a site that answered badly.
 */
function statusOf(res: FetchResult): number | null {
  if (res.ok) return res.status;
  return 'status' in res.failure ? res.failure.status : null;
}

export type PageSet = {
  entry: FetchedPage;
  others: FetchedPage[];
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  notFoundStatus: number | null;
  crawled: CrawledPage[];
  /** Unique in-scope URLs seen, whether or not we had budget to read them. */
  discovered: number;
  /** URLs we found and chose not to spend budget on, best first. */
  skipped: string[];
  budget: CrawlBudget;
  stoppedBecause: 'budget' | 'time' | 'exhausted';
};

/** Identity and commercial intent — the pages a person would check first. */
const PRIORITY = /(about|contact|service|pricing|price|faq|support|help|team|location)/i;

/** Rarely worth budget: pagination, archives, tags, filters. */
const LOW_VALUE = /(\/page\/\d|\/tag\/|\/category\/|\/author\/|\/\d{4}\/\d{2}\/|\?)/i;

type Candidate = {
  url: string;
  /** Clicks from the entry page. 0 is the entry itself. */
  depth: number;
  inSitemap: boolean;
  /** From the sitemap's <priority>, when it declares one. */
  sitemapPriority?: number;
};

/**
 * How worth reading is this URL, before we've read it?
 *
 * Depth dominates deliberately: it's the site's own statement of importance.
 * A page three clicks from the homepage is three clicks from the homepage for
 * a crawler too, and no amount of promising path text changes that.
 */
export function scoreCandidate(
  candidate: Candidate,
  /**
   * Hook for real traffic data — Search Console, analytics — once it exists.
   * Absent, it contributes nothing rather than a zero that would penalise every
   * page equally and quietly flatten the other signals.
   */
  organicValue?: (url: string) => number,
): number {
  let score = 100;

  score -= candidate.depth * 25;
  if (candidate.inSitemap) score += 20;
  if (candidate.sitemapPriority !== undefined) score += candidate.sitemapPriority * 10;
  if (PRIORITY.test(candidate.url)) score += 25;
  if (LOW_VALUE.test(candidate.url)) score -= 30;

  // Shallow paths beat deep ones: /services over /blog/2019/03/page/7.
  const segments = pathSegments(candidate.url);
  score -= Math.max(0, segments - 1) * 5;

  const organic = organicValue?.(candidate.url);
  if (organic !== undefined) score += organic;

  return score;
}

function pathSegments(raw: string): number {
  try {
    return new URL(raw).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/*
  Every fetch in the crawl, through the shared guard.

  ⚠️ IT USED TO CALL fetch() DIRECTLY WITH redirect: 'follow', AND THAT WAS THE
  HOLE. The guard ran on the URL we were about to request and then the platform
  followed the response's redirect chain wherever it led — so a page in
  somebody else's markup could bounce us onto a private address and the audit
  would read it back. safeFetch re-checks every hop. It also caps the body,
  which matters more here than anywhere: this runs up to a hundred times.
*/
async function fetchOnce(url: string): Promise<FetchResult> {
  return safeFetch(url, UA);
}

async function fetchEntry(
  url: string,
): Promise<{ ok: true; page: FetchedPage } | { ok: false; failure: FetchFailure }> {
  const res = await fetchOnce(url);
  if (!res.ok) return res;
  // A 200 with nothing in it isn't something we can audit, and saying so beats
  // reporting a score built from an empty document.
  if (!res.body) return { ok: false, failure: { kind: 'empty' } };

  return {
    ok: true,
    page: {
      url,
      status: res.status,
      finalUrl: res.finalUrl,
      bytes: res.body.length,
      ms: res.ms,
      html: res.body,
      facts: parsePage(res.body, res.finalUrl),
    },
  };
}

/** The crawl loop's version: a page we couldn't read is simply not in the set. */
async function fetchPage(url: string): Promise<FetchedPage | null> {
  const res = await fetchEntry(url);
  return res.ok ? res.page : null;
}

/**
 * URLs from a sitemap, following one level of <sitemapindex>.
 *
 * A large site's sitemap.xml is usually an index pointing at other sitemaps.
 * Reading that as a page list finds nothing — which is exactly the site whose
 * pages we most needed to enumerate.
 */
async function sitemapUrls(
  xml: string,
  stop: () => boolean,
  cap: number,
): Promise<{ url: string; priority?: number }[]> {
  const isIndex = /<sitemapindex/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  if (!isIndex) {
    return locs.slice(0, cap).map((url, i) => {
      // <priority> appears alongside its <loc> in document order.
      const block = xml.split(/<url>/i)[i + 1] ?? '';
      const p = /<priority>\s*([\d.]+)\s*<\/priority>/i.exec(block);
      return { url, priority: p ? Number(p[1]) : undefined };
    });
  }

  // Index: read a few child sitemaps rather than all of them — a big site can
  // list dozens, and the budget is better spent on pages than on more XML.
  const out: { url: string; priority?: number }[] = [];
  for (const child of locs.slice(0, 5)) {
    if (stop() || out.length >= cap) break;
    const res = await fetchOnce(child);
    if (res.ok && res.status === 200) {
      out.push(...(await sitemapUrls(res.body, stop, cap - out.length)));
    }
  }
  return out;
}

function normalise(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return raw;
  }
}

function inScope(raw: string, origin: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.origin !== origin) return null;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|xml|css|js|ico|woff2?)$/i.test(url.pathname)) {
      return null;
    }
    return normalise(url.toString());
  } catch {
    return null;
  }
}

/** Fetch just the entry page — what the free teaser needs. */
export async function fetchQuick(entryUrl: string): Promise<PageSetResult> {
  const res = await fetchEntry(entryUrl);
  if (!res.ok) return res;
  const entry = res.page;

  const robots = await fetchOnce(new URL('/robots.txt', entry.finalUrl).toString());

  return {
    ok: true,
    set: {
      entry,
      others: [],
      robotsTxt: robots.ok && robots.status === 200 ? robots.body : null,
      sitemapXml: null,
      llmsTxt: null,
      notFoundStatus: null,
      crawled: [toCrawled(entry)],
      discovered: 1,
      skipped: [],
      budget: { maxPages: 1, maxMs: DEFAULT_MAX_MS },
      stoppedBecause: 'budget',
    },
  };
}

export async function fetchPageSet(
  entryUrl: string,
  budget: CrawlBudget = { maxPages: DEFAULT_MAX_PAGES, maxMs: DEFAULT_MAX_MS },
): Promise<PageSetResult> {
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > budget.maxMs;

  const res = await fetchEntry(entryUrl);
  if (!res.ok) return res;
  const entry = res.page;

  const base = entry.finalUrl;
  const origin = new URL(base).origin;
  const at = (path: string) => new URL(path, base).toString();

  const [robots, sitemap, llms, missing] = await Promise.all([
    fetchOnce(at('/robots.txt')),
    fetchOnce(at('/sitemap.xml')),
    fetchOnce(at('/llms.txt')),
    fetchOnce(at('/faqflo-audit-404-probe')),
  ]);

  const robotsTxt = robots.ok && robots.status === 200 ? robots.body : null;
  const sitemapXml = sitemap.ok && sitemap.status === 200 ? sitemap.body : null;

  /* ------------------------------------------------------------ frontier --- */

  const seen = new Set<string>([normalise(base)]);
  const frontier = new Map<string, Candidate>();

  const consider = (raw: string, depth: number, fromSitemap = false, priority?: number) => {
    const url = inScope(raw, origin, base);
    if (!url || seen.has(url)) return;

    const existing = frontier.get(url);
    if (existing) {
      // Reached another way: keep the shallower depth and any sitemap evidence.
      existing.depth = Math.min(existing.depth, depth);
      existing.inSitemap = existing.inSitemap || fromSitemap;
      if (priority !== undefined) existing.sitemapPriority = priority;
      return;
    }
    frontier.set(url, { url, depth, inSitemap: fromSitemap, sitemapPriority: priority });
  };

  if (sitemapXml) {
    /*
      Discovery gets its own sub-budget, and its own cap on how many URLs it
      will take.

      Learned the hard way: gov.uk's sitemap is an index over 50,000 URLs, and
      enumerating it consumed the whole time budget before a single page was
      fetched — the audit "discovered" the entire site and read one page of it.
      The budget exists to be spent on PAGES. Discovery only has to surface
      enough good candidates to fill it, not to enumerate the site.
    */
    const discoveryDeadline = Date.now() + budget.maxMs * 0.25;
    const stopDiscovery = () => Date.now() > discoveryDeadline;
    const urlCap = Math.min(2000, Math.max(50, budget.maxPages * 20));

    // Sitemap entries are depth 1: the site listed them as pages worth knowing
    // about, but nothing says the homepage links to them directly.
    for (const fromMap of await sitemapUrls(sitemapXml, stopDiscovery, urlCap)) {
      consider(fromMap.url, 1, true, fromMap.priority);
    }
  }
  entry.facts.links.internal.forEach((l) => consider(l, 1));

  /* ------------------------------------------------------------- crawling --- */

  const others: FetchedPage[] = [];
  let stoppedBecause: PageSet['stoppedBecause'] = 'exhausted';

  while (others.length + 1 < budget.maxPages) {
    if (outOfTime()) {
      stoppedBecause = 'time';
      break;
    }
    if (frontier.size === 0) {
      stoppedBecause = 'exhausted';
      break;
    }

    // Take the best-scoring candidates for this round rather than the next in
    // insertion order — that's the whole point of a budget over a queue.
    const batch = [...frontier.values()]
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
      .slice(0, Math.min(CONCURRENCY, budget.maxPages - others.length - 1));

    for (const candidate of batch) {
      frontier.delete(candidate.url);
      seen.add(candidate.url);
    }

    const fetched = await Promise.all(batch.map((c) => fetchPage(c.url)));

    fetched.forEach((page, i) => {
      if (!page) return;
      others.push(page);
      // Its links join the frontier one level deeper.
      page.facts.links.internal.forEach((l) => consider(l, batch[i].depth + 1));
    });
  }

  if (others.length + 1 >= budget.maxPages && frontier.size > 0) stoppedBecause = 'budget';

  const skipped = [...frontier.values()]
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    .map((c) => c.url);

  return {
    ok: true,
    set: {
      entry,
      others,
      robotsTxt,
      sitemapXml,
      llmsTxt: llms.ok && llms.status === 200 ? llms.body : null,
      notFoundStatus: statusOf(missing),
      crawled: [entry, ...others].map(toCrawled),
      discovered: seen.size + frontier.size,
      skipped: skipped.slice(0, 20),
      budget,
      stoppedBecause,
    },
  };
}

function toCrawled(page: FetchedPage): CrawledPage {
  return {
    url: page.url,
    status: page.status,
    finalUrl: page.finalUrl,
    bytes: page.bytes,
    ms: page.ms,
  };
}

/** Every page in the set, entry first. */
export function allPages(set: PageSet): FetchedPage[] {
  return [set.entry, ...set.others];
}
