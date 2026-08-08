import { NextResponse } from 'next/server';
import type { FetchFailure } from '@/lib/audit/fetcher';
import { runAudit } from '@/lib/audit/run';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import type { AuditDepth } from '@/lib/audit/types';
import { AUDIT_TIME_BUDGET_MS, MAX_AUDIT_PAGES } from '@/lib/audit/limits';
import { AUDIT_FULL_RATE_LIMIT, AUDIT_RATE_LIMIT, checkRateLimit, clientIp } from '@/lib/rate-limit';

/*
  The AI-visibility audit.

  Every finding is measured from the pages themselves. The one thing we can't
  measure here — whether an engine is citing this site today — is returned as
  `locked` rather than estimated, because a made-up citation count is the most
  damaging thing this product could print, and it would poison the paid audit
  it's meant to sell. The dashboard fills that pillar from real tracking data
  when the account has a subscription; nothing else fills it at all.

  ⚠️ THIS ROUTE IS NOT AUTHENTICATED.

  Same position as /api/dashboard/generate: there is no session to check yet.
  A `full` run makes roughly eight outbound requests, so it gets its own,
  stricter daily bucket on top of the per-IP limit, and every URL — including
  the ones discovered inside the fetched HTML — passes the SSRF guard. Those
  are cost controls, not authorization. Gating on a real session is the auth
  stage's first job.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Why we couldn't read the site, in words, naming it.
 *
 * This used to be one sentence — "check the address and try again" — for every
 * way a fetch can fail, which meant we blamed the user for their host's
 * firewall, their host's downtime, and their host's slowness. Only the two
 * cases below that mention the address are ones where the address might
 * actually be wrong; the rest say plainly whose problem it is.
 *
 * The HTTP status follows the same honesty: 502/504 when the far end is at
 * fault, 400 only when the input plausibly is.
 */
function describe(failure: FetchFailure, domain: string): { message: string; status: number } {
  switch (failure.kind) {
    case 'blocked':
      return {
        message: `${domain} turned our checker away (HTTP ${failure.status}). Its firewall or bot protection is blocking us — the address is fine. Whoever manages the site can allow FaqFlo-Audit.`,
        status: 502,
      };
    case 'notfound':
      return {
        message: `${domain} says that page doesn't exist (HTTP ${failure.status}). Check the address, or try the site's home page.`,
        status: 400,
      };
    case 'server':
      return {
        message: `${domain} returned an error (HTTP ${failure.status}). That's a problem on their end — try again shortly.`,
        status: 502,
      };
    case 'timeout':
      return {
        message: `${domain} took too long to respond. Try again in a moment.`,
        status: 504,
      };
    case 'unreachable':
      return {
        message: `We couldn't reach ${domain}. Check the address, and that the site is online.`,
        status: 400,
      };
    case 'empty':
      return {
        message: `${domain} answered, but the page was empty — there was nothing for us to read.`,
        status: 502,
      };
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { url: input, depth: rawDepth, maxPages } = (body ?? {}) as Record<string, unknown>;

  if (typeof input !== 'string') return fail('A web address is required.', 400);
  const depth: AuditDepth = rawDepth === 'full' ? 'full' : 'quick';

  /*
    The page budget, clamped.

    There is no session here, so this cannot enforce the customer's actual tier
    — the dashboard sends `pageBudgetFor(site)` and an arbitrary caller can send
    whatever it likes. What the clamp does do is bound the blast radius: nobody
    gets more than the paid ceiling, so the worst case is a known number of
    outbound requests rather than an unbounded one. Per-tier enforcement belongs
    with auth, alongside gating this route at all.
  */
  const requested = typeof maxPages === 'number' && Number.isFinite(maxPages) ? maxPages : 1;
  const pageBudget = Math.max(1, Math.min(Math.floor(requested), MAX_AUDIT_PAGES));

  const ip = clientIp(request.headers);
  const withinQuick = checkRateLimit(`audit:${ip}`, AUDIT_RATE_LIMIT);
  const withinFull = depth === 'full' ? checkRateLimit(`audit-full:${ip}`, AUDIT_FULL_RATE_LIMIT) : true;

  if (!withinQuick || !withinFull) {
    return fail("That's the checks for today on this connection. They reset at midnight UTC.", 429);
  }

  const checked = checkPublicHttpUrl(input);
  if (!checked.ok) return fail(checked.reason, 400);

  try {
    /*
      Crawl-derived findings only.

      The AI-visibility pillar and the opportunities list come from the
      account's own data, and the dashboard merges them into this report on the
      client — where that data already lives. Deliberately NOT accepted from the
      request body: this endpoint is unauthenticated, and a body-supplied
      finding would let any caller put whatever they liked in a pillar labelled
      "AI visibility".
    */
    const result = await runAudit(checked.url.toString(), {
      depth,
      budget: { maxPages: pageBudget, maxMs: AUDIT_TIME_BUDGET_MS },
    });

    if (!result.ok) {
      const { message, status } = describe(
        result.failure,
        checked.url.hostname.replace(/^www\./, ''),
      );
      return fail(message, status);
    }

    return NextResponse.json(result.report);
  } catch (err) {
    console.error('Audit failed:', err);
    return fail('Something went wrong running that audit. Please try again.', 500);
  }
}
