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
