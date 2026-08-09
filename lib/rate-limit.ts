/**
 * Per-IP daily rate limit for the free generator.
 *
 * KNOWN LIMITATION — carried over from the Express version deliberately.
 *
 * This is an in-process Map. On Vercel each serverless instance has its own
 * copy and instances are recycled constantly, so the real-world limit is looser
 * than RATE_LIMIT suggests and resets unpredictably. It is a speed bump, not a
 * control.
 *
 * When Supabase lands in the next stage this moves into a table and becomes a
 * real limit. Left as-is until then so this stage changes one thing at a time.
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
