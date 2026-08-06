import { NextResponse } from 'next/server';
import { AI_CRAWLERS, type AuditCheck, type AuditResult } from '@/lib/audit/types';
import { isCrawlerAllowed } from '@/lib/audit/robots';
import { scoreOf } from '@/lib/audit/score';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import { AUDIT_RATE_LIMIT, checkRateLimit, clientIp } from '@/lib/rate-limit';

/*
  The free AI-visibility audit.

  Every check here is measured from the page itself. The one thing we can't
  measure for free — whether the site is being cited in AI answers today —
  is returned as `locked` rather than estimated. A made-up citation count would
  be the most damaging thing this product could print, and it would poison the
  paid audit it's meant to sell.
*/

const FETCH_TIMEOUT_MS = 10_000;
const UA = 'Mozilla/5.0 (compatible; FaqFlo-Audit/1.0; +https://faqflo.com)';

/** Text a crawler would see with no JavaScript run. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every @type named in the page's JSON-LD blocks. */
function schemaTypes(html: string): string[] {
  const found = new Set<string>();
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const block of blocks) {
    // Regex rather than a parse: these blocks are frequently invalid JSON in
    // the wild (trailing commas, templating left in), and one broken block
    // shouldn't cost us the others.
    for (const match of block[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      found.add(match[1]);
    }
  }

  return [...found];
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : '' };
}

export async function POST(request: Request) {
  if (!checkRateLimit(`audit:${clientIp(request.headers)}`, AUDIT_RATE_LIMIT)) {
    return fail("That's the free checks for today. They reset at midnight UTC.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { url: input } = (body ?? {}) as Record<string, unknown>;
  if (typeof input !== 'string') return fail('A web address is required.', 400);

  const checked = checkPublicHttpUrl(input);
  if (!checked.ok) return fail(checked.reason, 400);
  const target = checked.url;

  let html: string;
  try {
    const page = await fetchText(target.toString());
    if (!page.ok) {
      return fail(`We couldn't load that page (HTTP ${page.status}).`, 400);
    }
    html = page.body;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return fail('That site took too long to respond.', 504);
    }
    return fail("We couldn't reach that site. Check the address and try again.", 400);
  }

  // robots.txt is fetched separately and is allowed to fail: its absence is a
  // meaningful answer (everything is permitted), not an error.
  let robotsTxt: string | null = null;
  try {
    const robots = await fetchText(new URL('/robots.txt', target).toString());
    if (robots.ok) robotsTxt = robots.body;
  } catch {
    robotsTxt = null;
  }

  const checks: AuditCheck[] = [
    contentCheck(html),
    crawlerCheck(robotsTxt),
    schemaCheck(html),
    {
      id: 'cited',
      label: 'Cited in AI answers today',
      status: 'locked',
      detail:
        'Asking ChatGPT, Perplexity and Google AI Overviews what they say about you costs money per question, so it runs with the full audit — not on the free check.',
      weight: 0,
    },
  ];

  const result: AuditResult = {
    url: target.toString(),
    domain: target.hostname.replace(/^www\./, ''),
    score: scoreOf(checks),
    checks,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(result);
}

/* --------------------------------------------------------------- checks --- */

/**
 * Is the content in the HTML, or does it need JavaScript to appear?
 *
 * Thin and JS-rendered are two different diagnoses with two different fixes,
 * and the script count is what separates them. Blaming JavaScript for a page
 * that simply doesn't say much would send someone off to fix the wrong thing —
 * and it's the kind of confidently wrong answer that costs a diagnostic tool
 * its credibility.
 */
function contentCheck(html: string): AuditCheck {
  const words = visibleText(html).split(' ').filter(Boolean).length;
  const scripts = html.match(/<script/gi)?.length ?? 0;

  // A framework mount point with nothing in it is the clearest tell there is:
  // the markup is a container waiting for JavaScript to fill it.
  const hasMountPoint =
    /<div[^>]+id=["'](root|app|__next|application|main-app)["']/i.test(html) ||
    /__NEXT_DATA__|window\.__NUXT__|ng-version=|data-reactroot/i.test(html);

  // One script and almost no words counts too — a shell doesn't need three
  // script tags to be a shell, and web app builds often ship a single bundle.
  const jsHeavy = hasMountPoint || scripts >= 3 || (scripts >= 1 && words < 50);
  const label = 'Content readable without JavaScript';

  if (words >= 300) {
    return {
      id: 'raw-html',
      label,
      status: 'pass',
      detail: `About ${words.toLocaleString()} words are in the HTML itself, so a crawler sees them on the very first request.`,
      weight: 3,
    };
  }

  if (words >= 120) {
    return {
      id: 'raw-html',
      label,
      status: 'warn',
      detail: jsHeavy
        ? `Only about ${words.toLocaleString()} words are in the raw HTML, across ${scripts} scripts. Some of this page is probably drawn by JavaScript, which AI crawlers don't run.`
        : `Only about ${words.toLocaleString()} words are in the raw HTML. A crawler can read them, but there isn't much here to quote yet.`,
      weight: 3,
    };
  }

  return {
    id: 'raw-html',
    label,
    status: 'fail',
    detail: jsHeavy
      ? `Almost nothing is in the raw HTML — ${words} ${words === 1 ? 'word' : 'words'} alongside ${scripts} ${scripts === 1 ? 'script' : 'scripts'}, which is the shape of a page assembled by JavaScript in the browser. AI crawlers don't run JavaScript, so they see an empty page.`
      : `There are only about ${words} words in this page. It's readable, but there's essentially nothing here for an assistant to quote.`,
    weight: 3,
  };
}

/** Does robots.txt let the four AI crawlers in? */
function crawlerCheck(robotsTxt: string | null): AuditCheck {
  const blocked = AI_CRAWLERS.filter((agent) => !isCrawlerAllowed(robotsTxt, agent, '/'));

  if (blocked.length === 0) {
    return {
      id: 'crawlers',
      label: 'AI crawlers allowed',
      status: 'pass',
      detail: robotsTxt
        ? 'GPTBot, ClaudeBot, Google-Extended and PerplexityBot are all permitted by robots.txt.'
        : 'There is no robots.txt, which means every crawler is permitted by default.',
      weight: 3,
    };
  }

  return {
    id: 'crawlers',
    label: 'AI crawlers allowed',
    status: blocked.length === AI_CRAWLERS.length ? 'fail' : 'warn',
    detail: `robots.txt blocks ${blocked.join(', ')}. Nothing you publish can be quoted by ${
      blocked.length === 1 ? 'that engine' : 'those engines'
    } until that changes.`,
    weight: 3,
  };
}

/** Is there any machine-readable structure for an assistant to lean on? */
function schemaCheck(html: string): AuditCheck {
  const types = schemaTypes(html);
  const qa = types.filter((t) => /^(FAQPage|QAPage|Question)$/.test(t));
  const entity = types.filter((t) => /^(Organization|LocalBusiness|.*Business)$/.test(t));

  if (qa.length > 0) {
    return {
      id: 'schema',
      label: 'Questions marked up for machines',
      status: 'pass',
      detail: `Found ${qa.join(', ')} markup, so an assistant can tell which text is a question and which is the answer.`,
      weight: 2,
    };
  }

  if (entity.length > 0) {
    return {
      id: 'schema',
      label: 'Questions marked up for machines',
      status: 'warn',
      detail: `There's ${entity.join(', ')} markup identifying the business, but no question-and-answer markup for an assistant to quote from.`,
      weight: 2,
    };
  }

  return {
    id: 'schema',
    label: 'Questions marked up for machines',
    status: 'fail',
    detail:
      'No structured data at all. An assistant has to guess which text answers which question, and usually it guesses nothing.',
    weight: 2,
  };
}
