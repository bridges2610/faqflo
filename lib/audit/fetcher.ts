/**
 * Building the page set the audit reasons over.
 *
 * A single page can't answer site-wide questions — "are titles duplicated?",
 * "is there an about page?", "does anything here carry schema?" — so a full
 * audit fetches the entry page plus a handful of others, chosen the way a
 * person would: whatever the sitemap lists, else whatever the homepage links
 * to, preferring the pages that carry identity and commercial intent.
 *
 * Every fetch goes through the same SSRF guard as the entry URL. That matters
 * more here than it looks: the extra URLs come from the fetched page's own
 * markup, so a hostile site could otherwise point us at a private address and
 * use our server as a probe.
 */

import { parsePage, type PageFacts } from './parse';
import { checkPublicHttpUrl } from './url-guard';
import type { CrawledPage } from './types';

const TIMEOUT_MS = 10_000;
const MAX_EXTRA_PAGES = 5;
const CONCURRENCY = 3;
const UA = 'Mozilla/5.0 (compatible; FaqFlo-Audit/1.0; +https://faqflo.com)';

export type FetchedPage = CrawledPage & { html: string; facts: PageFacts };

export type PageSet = {
  entry: FetchedPage;
  /** Additional pages, in the order they were chosen. */
  others: FetchedPage[];
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  /** A path that should not exist, used to check the 404 behaviour. */
  notFoundStatus: number | null;
  crawled: CrawledPage[];
};

/** Pages worth fetching first — identity, commerce, and answers. */
const PRIORITY = /(about|contact|service|pricing|price|faq|support|help|team|location)/i;

async function fetchOnce(url: string): Promise<{ status: number; finalUrl: string; body: string; ms: number } | null> {
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
    return { status: res.status, finalUrl: res.url || guard.url.toString(), body, ms: Date.now() - started };
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

/** Plain <loc> extraction — enough for choosing what to read next. */
function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** Run tasks a few at a time rather than firing every request at once. */
async function pooled<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...(await Promise.all(tasks.slice(i, i + size).map((t) => t()))));
  }
  return results;
}

/**
 * Choose which other pages to read.
 *
 * Sitemap first because it's the site's own statement of what matters; the
 * homepage's internal links are the fallback. Both are filtered to the same
 * origin, stripped of fragments and queries, and deduped — three URLs that
 * differ only by `?utm_source` are one page, and spending the budget on them
 * would leave the audit blind to the rest of the site.
 */
function choosePages(entry: FetchedPage, sitemap: string | null): string[] {
  const origin = new URL(entry.finalUrl).origin;
  const seen = new Set([normalise(entry.finalUrl)]);
  const candidates: string[] = [];

  const consider = (raw: string) => {
    try {
      const url = new URL(raw, entry.finalUrl);
      if (url.origin !== origin) return;
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|xml|css|js)$/i.test(url.pathname)) return;
      const key = normalise(url.toString());
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(key);
    } catch {
      // Not a usable URL.
    }
  };

  if (sitemap) sitemapUrls(sitemap).forEach(consider);
  entry.facts.links.internal.forEach(consider);

  // Priority pages first, then whatever else, capped.
  const priority = candidates.filter((u) => PRIORITY.test(u));
  const rest = candidates.filter((u) => !PRIORITY.test(u));
  return [...priority, ...rest].slice(0, MAX_EXTRA_PAGES);
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
  };
}

export async function fetchPageSet(entryUrl: string): Promise<PageSet | null> {
  const entry = await fetchPage(entryUrl);
  if (!entry) return null;

  const base = entry.finalUrl;
  const at = (path: string) => new URL(path, base).toString();

  // A 404 on any of these is an answer, not an error.
  const [robots, sitemap, llms, missing] = await pooled(
    [
      () => fetchOnce(at('/robots.txt')),
      () => fetchOnce(at('/sitemap.xml')),
      () => fetchOnce(at('/llms.txt')),
      () => fetchOnce(at('/faqflo-audit-404-probe')),
    ],
    CONCURRENCY,
  );

  const robotsTxt = robots?.status === 200 ? robots.body : null;
  const sitemapXml = sitemap?.status === 200 ? sitemap.body : null;

  const others = (
    await pooled(
      choosePages(entry, sitemapXml).map((url) => () => fetchPage(url)),
      CONCURRENCY,
    )
  ).filter((p): p is FetchedPage => p !== null);

  return {
    entry,
    others,
    robotsTxt,
    sitemapXml,
    llmsTxt: llms?.status === 200 ? llms.body : null,
    notFoundStatus: missing?.status ?? null,
    crawled: [entry, ...others].map(toCrawled),
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
