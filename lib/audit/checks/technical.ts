/**
 * Technical foundation — can a crawler reach these pages and read them?
 *
 * The heaviest-weighted pillar, because everything else is moot if the answer
 * is no. A perfectly written FAQ behind a JavaScript shell, or on a site whose
 * robots.txt turns GPTBot away, is invisible no matter how good it is.
 */

import { isCrawlerAllowed } from '../robots';
import { allPages, type PageSet } from '../fetcher';
import { AI_CRAWLERS, type Finding } from '../types';

const P = 'technical' as const;

export function technicalChecks(set: PageSet): Finding[] {
  const { entry } = set;
  const facts = entry.facts;
  const findings: Finding[] = [];

  /* Content readable without JavaScript ---------------------------------- */
  // Thin and JS-rendered are different diagnoses with different fixes, and the
  // script count is what separates them. Blaming JavaScript for a page that
  // simply doesn't say much would send someone off to fix the wrong thing.
  {
    const { wordCount, scriptCount, looksLikeJsShell } = facts;
    findings.push(
      wordCount >= 300
        ? {
            id: 'raw-html',
            pillar: P,
            label: 'Content readable without JavaScript',
            status: 'pass',
            detail: `About ${wordCount.toLocaleString()} words are in the HTML itself, so a crawler sees them on the very first request.`,
            weight: 3,
          }
        : wordCount >= 120
          ? {
              id: 'raw-html',
              pillar: P,
              label: 'Content readable without JavaScript',
              status: 'warn',
              detail: looksLikeJsShell
                ? `Only about ${wordCount} words are in the raw HTML, alongside ${scriptCount} scripts. Some of this page is probably drawn by JavaScript, which AI crawlers don't run.`
                : `Only about ${wordCount} words are in the raw HTML. A crawler can read them, but there isn't much here to quote yet.`,
              weight: 3,
            }
          : {
              id: 'raw-html',
              pillar: P,
              label: 'Content readable without JavaScript',
              status: 'fail',
              detail: looksLikeJsShell
                ? `Almost nothing is in the raw HTML — ${wordCount} ${wordCount === 1 ? 'word' : 'words'} alongside ${scriptCount} ${scriptCount === 1 ? 'script' : 'scripts'}, which is the shape of a page assembled by JavaScript in the browser. AI crawlers don't run JavaScript, so they see an empty page.`
                : `There are only about ${wordCount} words in this page. It's readable, but there's essentially nothing here for an assistant to quote.`,
              weight: 3,
            },
    );
  }

  /* AI crawlers ---------------------------------------------------------- */
  {
    const blocked = AI_CRAWLERS.filter((a) => !isCrawlerAllowed(set.robotsTxt, a, '/'));
    findings.push({
      id: 'crawlers',
      pillar: P,
      label: 'AI crawlers allowed',
      status: blocked.length === 0 ? 'pass' : blocked.length === AI_CRAWLERS.length ? 'fail' : 'warn',
      detail:
        blocked.length === 0
          ? set.robotsTxt
            ? 'GPTBot, ClaudeBot, Google-Extended and PerplexityBot are all permitted by robots.txt.'
            : 'There is no robots.txt, which means every crawler is permitted by default.'
          : `robots.txt blocks ${blocked.join(', ')}. Nothing you publish can be quoted by ${
              blocked.length === 1 ? 'that engine' : 'those engines'
            } until that changes.`,
      weight: 3,
      evidence: blocked.length ? blocked.map((b) => `Disallowed: ${b}`) : undefined,
    });
  }

  /* Googlebot ------------------------------------------------------------ */
  {
    const allowed = isCrawlerAllowed(set.robotsTxt, 'Googlebot', '/');
    findings.push({
      id: 'googlebot',
      pillar: P,
      label: 'Googlebot allowed',
      status: allowed ? 'pass' : 'fail',
      detail: allowed
        ? 'Googlebot can crawl the site, which is what feeds AI Overviews as well as ordinary search.'
        : 'robots.txt blocks Googlebot, so neither search nor AI Overviews can use this site.',
      weight: 2,
    });
  }

  /* HTTPS ---------------------------------------------------------------- */
  findings.push({
    id: 'https',
    pillar: P,
    label: 'Served over HTTPS',
    status: entry.finalUrl.startsWith('https://') ? 'pass' : 'fail',
    detail: entry.finalUrl.startsWith('https://')
      ? 'The site is served over HTTPS.'
      : 'This page is served over plain HTTP. Assistants and search engines both discount insecure sources.',
    weight: 2,
  });

  /* noindex -------------------------------------------------------------- */
  {
    const robotsMeta = facts.metaRobots ?? '';
    const noindex = /noindex/i.test(robotsMeta);
    findings.push({
      id: 'noindex',
      pillar: P,
      label: 'Page is indexable',
      status: noindex ? 'fail' : 'pass',
      detail: noindex
        ? `This page carries a noindex robots tag (${robotsMeta}), which tells every engine to leave it out entirely.`
        : 'Nothing on the page asks engines to leave it out.',
      weight: 3,
    });
  }

  /* Canonical ------------------------------------------------------------ */
  {
    const canonical = facts.canonical;
    const selfReferential = canonical
      ? normalise(canonical) === normalise(entry.finalUrl)
      : false;
    findings.push({
      id: 'canonical',
      pillar: P,
      label: 'Canonical URL declared',
      status: !canonical ? 'warn' : selfReferential ? 'pass' : 'warn',
      detail: !canonical
        ? "No canonical tag. It's how you tell an engine which URL is the real one when the same page is reachable more than one way."
        : selfReferential
          ? 'The canonical tag points at this page, which is what it should do.'
          : `The canonical tag points somewhere else (${canonical}), so engines will credit that URL instead of this one.`,
      weight: 2,
    });
  }

  /* Sitemap -------------------------------------------------------------- */
  {
    const declared = set.robotsTxt ? /sitemap:\s*\S+/i.test(set.robotsTxt) : false;
    findings.push({
      id: 'sitemap',
      pillar: P,
      label: 'Sitemap available',
      status: set.sitemapXml ? (declared ? 'pass' : 'warn') : 'fail',
      detail: set.sitemapXml
        ? declared
          ? 'A sitemap.xml exists and robots.txt points at it.'
          : 'A sitemap.xml exists, but robots.txt does not mention it, so crawlers have to guess it is there.'
        : 'No sitemap.xml at the usual location. Crawlers then have to find every page by following links.',
      weight: 2,
    });
  }

  /* Structured data validity --------------------------------------------- */
  findings.push(
    facts.schemaBlocks === 0
      ? {
          id: 'schema-valid',
          pillar: P,
          label: 'Structured data parses',
          status: 'na',
          detail: 'There is no structured data on this page to validate.',
          weight: 2,
        }
      : {
          id: 'schema-valid',
          pillar: P,
          label: 'Structured data parses',
          status: facts.schemaParsed ? 'pass' : 'fail',
          detail: facts.schemaParsed
            ? facts.schemaBlocks === 1
              ? 'The page’s one JSON-LD block parses cleanly.'
              : `All ${facts.schemaBlocks} JSON-LD blocks parse cleanly.`
            : 'At least one JSON-LD block is invalid JSON. A machine that cannot parse it ignores the whole block.',
          weight: 2,
        },
  );

  /* Language + viewport --------------------------------------------------- */
  findings.push({
    id: 'lang',
    pillar: P,
    label: 'Page language declared',
    status: facts.lang ? 'pass' : 'warn',
    detail: facts.lang
      ? `The page declares lang="${facts.lang}".`
      : 'The <html> tag has no lang attribute, so a machine has to guess what language this is written in.',
    weight: 1,
  });

  findings.push({
    id: 'viewport',
    pillar: P,
    label: 'Mobile viewport set',
    status: facts.hasViewport ? 'pass' : 'warn',
    detail: facts.hasViewport
      ? 'A viewport meta tag is present.'
      : 'No viewport meta tag, so the page will render at desktop width on a phone.',
    weight: 1,
  });

  /* Response speed -------------------------------------------------------- */
  {
    const ms = entry.ms;
    findings.push({
      id: 'speed',
      pillar: P,
      label: 'Server responds quickly',
      status: ms < 800 ? 'pass' : ms < 2500 ? 'warn' : 'fail',
      detail: `The page took ${(ms / 1000).toFixed(1)}s to fetch. ${
        ms < 800
          ? 'That is comfortably quick.'
          : 'Slow responses get crawled less often and less deeply.'
      }`,
      weight: 1,
    });
  }

  /* Redirects ------------------------------------------------------------- */
  {
    const redirected = normalise(entry.url) !== normalise(entry.finalUrl);
    findings.push({
      id: 'redirect',
      pillar: P,
      label: 'Entry URL resolves directly',
      status: redirected ? 'warn' : 'pass',
      detail: redirected
        ? `${entry.url} redirects to ${entry.finalUrl}. One hop is normal; make sure the address you publish is the destination.`
        : 'The URL resolves without redirecting.',
      weight: 1,
    });
  }

  /* 404 handling ---------------------------------------------------------- */
  findings.push(
    set.notFoundStatus === null
      ? {
          id: 'notfound',
          pillar: P,
          label: 'Missing pages return 404',
          status: 'na',
          detail: 'Could not test how the site handles a missing page.',
          weight: 1,
        }
      : {
          id: 'notfound',
          pillar: P,
          label: 'Missing pages return 404',
          status: set.notFoundStatus === 404 || set.notFoundStatus === 410 ? 'pass' : 'warn',
          detail:
            set.notFoundStatus === 404 || set.notFoundStatus === 410
              ? 'A URL that does not exist correctly returns 404.'
              : `A URL that does not exist returned ${set.notFoundStatus} instead of 404, so crawlers will treat junk pages as real content.`,
          weight: 1,
        },
  );

  /* Coverage ---------------------------------------------------------------- */
  /*
    Informational, not scored. A site isn't wrong for being bigger than the
    budget — but every counting finding below is about the pages we actually
    read, and that has to be stated where the reader can see it rather than
    inferred from a list of URLs at the bottom of the report.
  */
  {
    const read = set.crawled.length;
    const found = Math.max(set.discovered, read);
    const reason =
      set.stoppedBecause === 'time'
        ? ' The scan stopped early because the site was slow to respond.'
        : set.stoppedBecause === 'budget'
          ? ' Pages were chosen by link depth, sitemap presence and page type — not the order they were found in.'
          : '';

    findings.push({
      id: 'coverage',
      pillar: P,
      label: 'Pages scanned',
      status: 'na',
      detail:
        found > read
          ? `Scanned ${read} of ${found} pages found.${reason} Everything below describes the ${read} ${read === 1 ? 'page that was' : 'that were'} read.`
          : `Scanned all ${read} ${read === 1 ? 'page' : 'pages'} found on the site.`,
      weight: 0,
      evidence: set.skipped.length ? [`Not scanned, best first: ${set.skipped.slice(0, 5).join(', ')}`] : undefined,
    });
  }

  /* Site-wide reachability ------------------------------------------------ */
  {
    const pages = allPages(set);
    const broken = pages.filter((p) => p.status >= 400);
    findings.push({
      id: 'reachable',
      pillar: P,
      label: 'Crawled pages all responded',
      status: broken.length === 0 ? 'pass' : 'warn',
      detail:
        broken.length === 0
          ? `All ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} we fetched returned successfully.`
          : `${broken.length} of the ${pages.length} pages we tried returned an error.`,
      weight: 1,
      evidence: broken.map((b) => `${b.status} — ${b.url}`),
    });
  }

  return findings;
}

function normalise(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return raw;
  }
}
