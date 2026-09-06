/**
 * Daily rate limits, keyed by account where there is one and IP where there
 * isn't.
 *
 * KNOWN LIMITATION — still an in-process Map. On Vercel each serverless
 * instance has its own copy and instances are recycled constantly, so the
 * real-world limit is looser than the numbers suggest and resets
 * unpredictably. It is a speed bump, not a control.
 *
 * What changed with auth is what it's protecting, not how well it works. It
 * used to be the ONLY thing between a stranger and an unmetered Claude
 * endpoint — the gated routes now check a real session first, so this has gone
 * from the security boundary to a cost control, which is all a speed bump was
 * ever fit to be. The genuinely anonymous routes (the free generator and the
 * quick audit) still lean on it alone, which is why it should still move into
 * a Postgres table with a proper window.
 */

export const RATE_LIMIT = 3;

/**
 * Ceiling for the dashboard generator.
 *
 * Higher than the free limit, but not absent: that route is not authenticated
 * yet, so this is the only thing standing between a stranger and an unmetered
 * Claude endpoint. It goes away when a real session check replaces it.
 */
export const DASHBOARD_RATE_LIMIT = 40;

/**
 * Daily ceiling for a signed-in FREE account on the dashboard generator.
 *
 * ⚠️ IT EXISTS BECAUSE THE FREE ROUTE WAS BORROWING THE ANONYMOUS ONE, AND THAT
 * CANCELLED A GRANT. app/api/dashboard/generate read
 * `pro ? DASHBOARD_RATE_LIMIT : RATE_LIMIT`, so a free account got RATE_LIMIT's
 * three a day — while the plan sells five sets plus an article's FAQs. Five
 * sets could not be written in one sitting, which is the wall Beau hit testing
 * it.
 *
 * ⚠️ AND RATE_LIMIT ITSELF MUST NOT MOVE TO FIX THAT. It is the ceiling on
 * /api/generate, which is genuinely anonymous — its own note calls the limiter
 * "the ONLY thing between a stranger and an unmetered Claude endpoint". Raising
 * it to serve signed-in accounts would loosen the one route with no session
 * behind it. Two ceilings, the way FETCH_URL_RATE_LIMIT and
 * FETCH_URL_ANON_RATE_LIMIT split for the same reason.
 *
 * Ten is the grant plus room to redo one: five sets, one article's FAQs, and a
 * few retries. The real spend control is now the lifetime cap in 0021 — this is
 * only a speed bump against a loop.
 */
export const FREE_DASHBOARD_RATE_LIMIT = 10;

/**
 * Ceiling for the free visibility audit.
 *
 * Higher than the generator's limit because an audit costs us two HTTP fetches
 * rather than a model call, and it's the top of the funnel — a stranger kicking
 * the tyres on a few sites is the behaviour we want.
 */
export const AUDIT_RATE_LIMIT = 20;

/**
 * Ceiling for a full audit.
 *
 * A full run now reads up to a hundred pages — a hundred outbound requests to
 * somebody else's server, not the handful it used to be. This limiter is the
 * only thing standing between an unauthenticated endpoint and hammering a
 * stranger's site, so it drops accordingly, in its own bucket so someone
 * kicking the tyres on the free check can't exhaust it.
 */
export const AUDIT_FULL_RATE_LIMIT = 4;

/**
 * Ceiling for the content plan.
 *
 * The most expensive call in the app: a hundred pages of context on the biggest
 * model, at roughly a sixth of a dollar a run. Low because it should be — a
 * plan is generated once per site and then read, so a customer who legitimately
 * needs ten in a day is a customer with ten sites, and anyone past that is
 * either testing or spending our money for us.
 */
export const CONTENT_RATE_LIMIT = 10;

/**
 * Ceiling for article writing, per day.
 *
 * ⚠️ NOT THE ALLOWANCE. ARTICLE_CAP in lib/dashboard/plans.ts is what the
 * customer bought — ten a month, counted over the billing window and enforced
 * against stored rows. This is the abuse guard underneath it, and it exists for
 * a case that one cannot cover: an account that is inside its monthly allowance
 * but firing the button in a loop.
 *
 * Above ten so it never lands first in normal use. Somebody who legitimately
 * wants their whole month in one afternoon should get it; the monthly cap is
 * what stops them at ten, with a sentence that names the real reason.
 */
export const ARTICLE_RATE_LIMIT = 15;

/**
 * Ceiling for question discovery.
 *
 * Same model and roughly the same context as the content plan, so the same
 * reasoning applies: a set of questions is discovered once per site and then
 * worked through. Ten a day is ten sites' worth. Regenerating repeatedly on one
 * site produces a slightly different list each time rather than a better one,
 * which is a good reason to make it inconvenient.
 */
export const QUESTIONS_RATE_LIMIT = 10;

/**
 * Ceiling for reading a page into the generator.
 *
 * Generous, because it is a step inside a normal working session rather than
 * an end in itself — someone writing FAQs for six pages hits it six times in a
 * row legitimately. It exists because the route had no limit at all, which
 * made it a free fetch proxy: cheap for us per call, but pointed at somebody
 * else's server, from our address, as many times as anyone liked.
 */
export const FETCH_URL_RATE_LIMIT = 60;

/**
 * Favicons fetched for the Competitors page.
 *
 * High, because one page view legitimately asks for up to six at once and a
 * customer flicking between screens will do that repeatedly. The real defence
 * is not this number: the route only serves signed-in callers, only ever
 * fetches an image, and caches what it gets, so a determined caller is mostly
 * hitting our own cache rather than anybody else's server.
 */
export const FAVICON_RATE_LIMIT = 120;

/**
 * Ceiling for reading a page when nobody is signed in.
 *
 * ⚠️ THE ROUTE USED TO REFUSE ANONYMOUS CALLERS OUTRIGHT, WHICH IS WHY THERE
 * WAS ONLY ONE NUMBER ABOVE. The FAQ generator on the home page offers a "Use
 * a URL" mode to visitors with no account, and it failed every time with "Sign
 * in to read a page." Opening the route is what makes a second, lower ceiling
 * necessary: 60 was sized for a signed-in working session and is far too
 * generous for a bucket keyed by IP.
 *
 * Ten, because of what it feeds. The anonymous generator is capped at
 * RATE_LIMIT (3) sets a day, so nobody can productively read more than a
 * handful of pages — ten leaves room for typos, a retry, and a look at two
 * different pages, and stops well short of being a usable fetch proxy. It sits
 * below AUDIT_RATE_LIMIT (20), the other anonymous route whose cost is
 * outbound HTTP rather than a model call.
 *
 * ⚠️ IP-KEYED, SO IT IS A SPEED BUMP — the same caveat as
 * DONE_FOR_YOU_RATE_LIMIT below. The Map is per serverless instance, and
 * x-forwarded-for is client-supplied unless the platform overwrites it. The
 * real protections on that route are the SSRF guard and the redirect check in
 * lib/audit/safe-fetch.ts; this is a cost control.
 */
export const FETCH_URL_ANON_RATE_LIMIT = 10;

/**
 * Ceiling for support messages from the Help page.
 *
 * Low, because the point is a mailbox and nobody legitimately files ten support
 * requests before midnight. Note this is one of the few limits the in-process
 * Map above actually enforces reasonably well: the route requires a session, so
 * the key is `user:<id>` rather than an IP that changes with the instance.
 */
export const CONTACT_RATE_LIMIT = 5;

/**
 * Ceiling for done-for-you enquiries from the public landing page.
 *
 * ⚠️ THIS ONE IS KEYED BY IP, AND THE COMMENT ABOVE ABOUT CONTACT_RATE_LIMIT
 * DOES NOT TRANSFER. That route requires a session, so its bucket is
 * `user:<id>` and the in-process Map holds up reasonably. This route is
 * genuinely anonymous — the only public form in the app — so it is back to
 * `ip:<addr>` on serverless instances that each carry their own copy of the
 * Map. It is a speed bump, and the honeypot in the route is the other half of
 * the answer.
 *
 * Three, not five. Nobody enquires about a retainer four times in a day,
 * and unlike the support form there is no legitimate "actually, one more
 * thing" — the reply is a conversation by email from that point on.
 */
export const DONE_FOR_YOU_RATE_LIMIT = 3;

/**
 * Ceiling for manual citation-tracking runs.
 *
 * ⚠️ The most expensive thing a customer can press. One call is a batch of
 * questions against three search-backed engines — Gemini bills grounding
 * separately from tokens, and OpenAI bills the web search — so this is real
 * money per press, spent on somebody else's infrastructure.
 *
 * ⚠️ THE UNIT IS REQUESTS, BUT THE BUDGET IS RUNS, AND THEY ARE NOT 1:1. One
 * honest run is several requests — the route asks a bounded slice per call and
 * the client loops until nothing is left, so a full set at Pro's promptCap (25)
 * with PROMPTS_PER_RUN (5) is ceil(25 / 5) = 5 requests. This number is
 * therefore sized as 12 runs × 5 requests:
 *
 *     12 runs/day × ceil(25 prompts / 5 per request) = 60
 *
 * ⚠️ SIZED ON PRO, WHICH IS WHY FREE GAINING A BUTTON DID NOT MOVE IT. Free's
 * cap is 3, so one of its runs is ceil(3 / 5) = a single request, and its whole
 * lifetime allowance is three of them. It cannot approach this ceiling; the
 * thing that stops a free account is checksPerPeriod (27, over a window that
 * never resets), not this. A limit sized for the larger plan already covers the
 * smaller one — but that is only true while free's cap stays below Pro's, so
 * check both if either moves.
 *
 * ⚠️ IT IS DERIVED FROM THE PROMPT CAP AND MUST BE REDONE WHEN THAT MOVES. It
 * was 84 while the cap was 35, and 60 before that when the cap was 25 — leaving
 * a stale value cuts a subscriber to fewer full runs a day than the comment
 * claims, silently. It was 12 once, which read as "12 runs" and behaved as
 * barely two: one click could exhaust the day, because the client's own retry
 * loop is bounded at 12 passes and a single press could spend the whole
 * allowance by design.
 *
 * ⚠️ Not derived by importing PROMPTS_PER_RUN: that lives in lib/tracking/run.ts,
 * which is `server-only`, and this module must stay importable from anywhere.
 * The arithmetic is written out instead — if either input moves, redo it here.
 *
 * Spend itself is bounded elsewhere and does not depend on this: the route
 * skips questions already checked today, so repeat presses ask nobody anything.
 * This limit exists to stop request floods, not to cap the bill. Low enough
 * that holding the button down is not a business model. The weekly scheduler
 * runs its checks through lib/scan/run.ts rather than through this route, so
 * this is now the manual-override allowance it always read like.
 */
export const TRACKING_RATE_LIMIT = 60;

/**
 * Page summaries per day, per account.
 *
 * ⚠️ WELL ABOVE WHAT EITHER PLAN CAN SPEND, WHICH IS THE POINT. ARTICLE_RATE_
 * LIMIT's note states the rule: the plan cap is what the customer bought, the
 * daily limit is the abuse guard underneath it, and it must never be the thing
 * that lands first in normal use. Free's ceiling is three for the life of the
 * account, so this can only ever fire for Pro — which has five screens, each
 * rewritten only when its numbers move. Anyone reaching 30 in a day is looping
 * a script, not reading.
 */
export const SUMMARY_RATE_LIMIT = 30;

type Entry = { count: number; resetAt: number };
const hits = new Map<string, Entry>();

/**
 * @param key   Bucket to count against — namespace it per route (`dash:${ip}`)
 *              so one surface's usage can't exhaust another's allowance.
 * @param limit Requests per UTC day. Defaults to the free-tier limit.
 */
export function checkRateLimit(key: string, limit: number = RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    const midnightUtc = new Date();
    midnightUtc.setUTCHours(24, 0, 0, 0);
    hits.set(key, { count: 1, resetAt: midnightUtc.getTime() });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count += 1;
  return true;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Who this request counts against.
 *
 * An account id when we have one, the IP otherwise. Keying a signed-in route
 * by IP charges an office of twenty people to one bucket and lets one person
 * with a phone reset theirs at will; neither is what the limit is for. The
 * `user:` / `ip:` prefixes keep the two namespaces from ever colliding.
 */
export function limitKey(userId: string | null, headers: Headers): string {
  return userId ? `user:${userId}` : `ip:${clientIp(headers)}`;
}
