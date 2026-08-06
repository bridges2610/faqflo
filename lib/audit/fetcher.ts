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
import { checkPublicHttpUrl } from './url-guard';
import type { CrawledPage } from './types';

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const UA = 'Mozilla/5.0 (compatible; FaqFlo-Audit/1.0; +https://faqflo.com)';

/** Default ceilings. The caller passes the real ones from the plan. */
export const DEFAULT_MAX_PAGES = 1;
export const DEFAULT_MAX_MS = 60_000;

export type CrawlBudget = { maxPages: number; maxMs: number };

export type FetchedPage = CrawledPage & { html: string; facts: PageFacts };

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

async function fetchOnce(
  url: string,
): Promise<{ status: number; finalUrl: string; body: string; ms: number } | null> {
  const guard = checkPublicHttpUrl(url);
  if (!guard.ok) return null;

  const started = Date.now();
  try {
    const res = await fetch(guard.url.toString(), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    const body = res.ok ? await res.text() : '';
    return {
      status: res.status,
      finalUrl: res.url || guard.url.toString(),
      body,
      ms: Date.now() - started,
    };
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<FetchedPage | null> {
  const res = await fetchOnce(url);
  if (!res || !res.body) return null;

  return {
    url,
    status: res.status,
    finalUrl: res.finalUrl,
    bytes: res.body.length,
    ms: res.ms,
    html: res.body,
    facts: parsePage(res.body, res.finalUrl),
  };
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
    if (res?.status === 200) {
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
export async function fetchQuick(entryUrl: string): Promise<PageSet | null> {
  const entry = await fetchPage(entryUrl);
  if (!entry) return null;

  const robots = await fetchOnce(new URL('/robots.txt', entry.finalUrl).toString());

  return {
    entry,
    others: [],
    robotsTxt: robots && robots.status === 200 ? robots.body : null,
    sitemapXml: null,
    llmsTxt: null,
    notFoundStatus: null,
    crawled: [toCrawled(entry)],
    discovered: 1,
    skipped: [],
    budget: { maxPages: 1, maxMs: DEFAULT_MAX_MS },
    stoppedBecause: 'budget',
  };
}

export async function fetchPageSet(
  entryUrl: string,
  budget: CrawlBudget = { maxPages: DEFAULT_MAX_PAGES, maxMs: DEFAULT_MAX_MS },
): Promise<PageSet | null> {
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > budget.maxMs;

  const entry = await fetchPage(entryUrl);
  if (!entry) return null;

  const base = entry.finalUrl;
  const origin = new URL(base).origin;
  const at = (path: string) => new URL(path, base).toString();

  const [robots, sitemap, llms, missing] = await Promise.all([
    fetchOnce(at('/robots.txt')),
    fetchOnce(at('/sitemap.xml')),
    fetchOnce(at('/llms.txt')),
    fetchOnce(at('/faqflo-audit-404-probe')),
  ]);

  const robotsTxt = robots?.status === 200 ? robots.body : null;
  const sitemapXml = sitemap?.status === 200 ? sitemap.body : null;

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
    entry,
    others,
    robotsTxt,
    sitemapXml,
    llmsTxt: llms?.status === 200 ? llms.body : null,
    notFoundStatus: missing?.status ?? null,
    crawled: [entry, ...others].map(toCrawled),
    discovered: seen.size + frontier.size,
    skipped: skipped.slice(0, 20),
    budget,
    stoppedBecause,
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
