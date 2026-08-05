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

type Entry = { count: number; resetAt: number };
const hits = new Map<string, Entry>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now >= entry.resetAt) {
    const midnightUtc = new Date();
    midnightUtc.setUTCHours(24, 0, 0, 0);
    hits.set(ip, { count: 1, resetAt: midnightUtc.getTime() });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count += 1;
  return true;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
