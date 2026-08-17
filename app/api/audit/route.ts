import { after, NextResponse } from 'next/server';
import type { FetchFailure } from '@/lib/audit/fetcher';
import { runAudit } from '@/lib/audit/run';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import type { AuditDepth } from '@/lib/audit/types';
import { AUDIT_TIME_BUDGET_MS } from '@/lib/audit/limits';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canRunFullAudit, hasGetCited, pageBudgetFor } from '@/lib/auth/entitlements';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AUDIT_FULL_RATE_LIMIT,
  AUDIT_RATE_LIMIT,
  checkRateLimit,
  limitKey,
} from '@/lib/rate-limit';

/*
  The AI-visibility audit.

  Every finding is measured from the pages themselves. The one thing we can't
  measure here — whether an engine is citing this site today — is returned as
  `locked` rather than estimated, because a made-up citation count is the most
  damaging thing this product could print, and it would poison the paid audit
  it's meant to sell. The dashboard fills that pillar from real tracking data
  when the account has a subscription; nothing else fills it at all.

  TWO CALLERS, TWO RULES — this is the only route with a split personality.

  `quick` is the free check on the marketing page. It stays open to anonymous
  callers on purpose: the site promises "Free · No signup" in five places, and
  it reads one page, which is a cheap thing to give away. IP-limited, as before.

  `full` is the paid crawl. It now requires a session, a `siteId` the caller
  actually owns, and Get Cited on that site — and the page budget is computed
  HERE from the site row rather than read from the request. That last part is
  the fix for what this file used to admit: "the dashboard sends
  pageBudgetFor(site) and an arbitrary caller can send whatever it likes."
  A hundred pages is a hundred outbound requests to somebody else's server, so
  who may ask for that is not a client-side decision.
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

  const { url: input, depth: rawDepth, siteId } = (body ?? {}) as Record<string, unknown>;

  if (typeof input !== 'string') return fail('A web address is required.', 400);
  const depth: AuditDepth = rawDepth === 'full' ? 'full' : 'quick';

  /*
    Who is asking, and what may they have?

    `maxPages` is no longer read from the body at all. For a quick run the
    budget is one page by definition; for a full run it comes from the site row
    via pageBudgetFor(). There is no path left where a caller states its own
    allowance.
  */
  const user = await currentUser();
  let pageBudget = 1;

  /*
    Resolved for BOTH depths when a site id is supplied, not just for full runs.

    A signed-in customer on a free site sends `depth: 'quick'` with their site
    id, and that run is still their site's score on that day — worth recording,
    so their history doesn't begin only at the moment they pay. A quick run from
    the marketing page has no user and no site, and records nothing.

    Ownership still decides everything: an unowned id is null here, which for a
    full run is a 404 and for a quick run simply means nothing is recorded.
  */
  const site =
    user && typeof siteId === 'string' && siteId ? await siteForUser(siteId, user.id) : null;

  if (depth === 'full') {
    if (!user) {
      return fail('Sign in to run a full audit.', 401);
    }
    if (typeof siteId !== 'string' || !siteId) {
      return fail('A full audit needs a site.', 400);
    }

    /*
      404, not 403. Confirming that a site id exists but belongs to somebody
      else tells an attacker their guess was right; "no such site of yours" is
      true either way and says nothing.
    */
    if (!site) return fail('No such site on your account.', 404);

    /*
      Two different refusals wearing one status code would be a bad experience:
      "you never bought this" and "your 30 days are up" need different next
      steps, and only one of them is a purchase of Get Cited. See
      lib/auth/entitlements.ts for why the window exists.
    */
    if (!canRunFullAudit(site, user)) {
      return fail(
        hasGetCited(site)
          ? 'Your Get Cited window has ended for this site. Stay Cited keeps audits running.'
          : 'A full audit is part of Get Cited for this site.',
        403,
      );
    }

    pageBudget = pageBudgetFor(site, user);
  }

  const key = limitKey(user?.id ?? null, request.headers);
  const withinQuick = checkRateLimit(`audit:${key}`, AUDIT_RATE_LIMIT);
  const withinFull =
    depth === 'full' ? checkRateLimit(`audit-full:${key}`, AUDIT_FULL_RATE_LIMIT) : true;

  if (!withinQuick || !withinFull) {
    return fail("That's the checks for today. They reset at midnight UTC.", 429);
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

    /*
      Record the run, after the response.

      `after()` rather than an awaited insert: the customer waited up to sixty
      seconds for the crawl and should not also wait on a write they will never
      see. Recording history is not part of producing the report — if it fails,
      the report is still correct and still returned.

      Written with the service-role client because `audit_runs` has no INSERT
      grant for `authenticated` (see 0005). A browser that can write its own
      score history can write a history that never happened.
    */
    if (user && site) {
      const report = result.report;
      after(async () => {
        /*
          The business's real name, for mention matching.

          ⚠️ NOT GATED ON profileIsUsable(). That predicate asks whether we know
          enough to skip an LLM call — it requires industry AND location — and a
          site can publish a perfectly good organisation name with neither. Using
          it here would discard the name we came for.

          Written service-role because `authenticated` has UPDATE on a named
          column list that excludes this one (0001, 0007). It decides what counts
          as a mention, so a browser that could set it could manufacture its own
          visibility score.
        */
        const found = report.profile?.name?.trim();
        // A name that is just the domain teaches us nothing `sites.name` did not
        // already say, and writing it would look like we had learned something.
        const useful =
          found &&
          found.length > 1 &&
          found.length <= 120 &&
          !isNamedAfterDomain(found, site.domain);

        if (useful) {
          try {
            await createAdminClient()
              .from('sites')
              .update({ brand_name: found })
              .eq('id', site.id);
          } catch (err) {
            console.error('Could not record business name:', err);
          }
        }

        try {
          await createAdminClient()
            .from('audit_runs')
            .insert({
              site_id: site.id,
              user_id: user.id,
              score: report.score,
              scored_count: report.scoredCount,
              depth: report.depth,
              // Only pillars that actually produced a score. A null one was not
              // measured, and storing it as 0 would make the trend claim a
              // failure where there was no measurement.
              pillar_scores: Object.fromEntries(
                report.pillars
                  .filter((p) => p.score !== null)
                  .map((p) => [p.id, p.score as number]),
              ),
              /*
                ⚠️ THE WHOLE REPORT, AND THIS IS WHAT FIXES THE OLDEST DEFECT
                IN THE AUDIT.

                Until 0009 the report was written by the browser, in the
                component's closure, after the fetch resolved — so a customer
                who navigated away during a crawl of up to a hundred pages lost
                a report they had already paid for, and there was no indicator
                anywhere that it had ever been running. Writing it here means
                the tab no longer has to survive for the result to.

                It is also what lets the server run question discovery at all:
                lib/dashboard/discover.ts refuses without `pages`, and until now
                `pages` existed only in a browser.
              */
              report,
              checked_at: report.checkedAt,
            });
        } catch (err) {
          console.error('Could not record audit run:', err);
        }
      });
    }

    return NextResponse.json(result.report);
  } catch (err) {
    console.error('Audit failed:', err);
    return fail('Something went wrong running that audit. Please try again.', 500);
  }
}
