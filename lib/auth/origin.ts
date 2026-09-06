import 'server-only';

import { headers } from 'next/headers';

/**
 * Where this deployment actually lives, for building redirect URLs.
 *
 * Every auth email and OAuth handshake carries an absolute URL back to us, and
 * getting it wrong is a bad failure: the link in a confirmation email points at
 * localhost forever, or a preview deployment sends people to production.
 *
 * Env var first so a deploy can state its own canonical origin, then the
 * request headers, which handle preview URLs and local dev without config.
 * `x-forwarded-*` is what a proxy in front of the app sets — on Vercel that is
 * always present.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';

  // No host at all shouldn't happen over HTTP, but a thrown error here would
  // surface as a broken sign-up rather than a missing config.
  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

/**
 * Keep a `?next=` value pointing at our own app.
 *
 * An unchecked redirect target is an open redirect: sign-in links get mailed
 * around with `?next=https://evil.example`, and we hand the browser over
 * immediately after proving who someone is.
 *
 * ⚠️ THIS WAS `startsWith('/') && !startsWith('//')` AND THAT LET AN ATTACKER
 * OUT. Browsers normalise a backslash to a slash in the authority position, so
 * `/\evil.com` is a protocol-relative URL wearing a path's clothes twice over:
 * it passes both string checks, and then the URL parser resolves it to
 * `https://evil.com/`. Measured, not theorised — `//evil.com` was rejected and
 * `/\evil.com` sailed through. `/\/evil.com` did the same.
 *
 * ⚠️ SO THE PARSER DECIDES, NOT A PATTERN. Anything that produces a different
 * origin when resolved is refused, whatever spelling it used to get there —
 * which is the only version of this check that does not need updating each time
 * somebody finds another character browsers are lenient about. Rebuilding the
 * return value from the parsed parts also drops anything exotic rather than
 * passing it along.
 *
 * ⚠️ THE BASE IS A RESERVED-BY-RFC-2606 HOST, NOT OUR OWN ORIGIN. `.invalid` can
 * never resolve, so if this value ever escapes into a real request it fails
 * closed rather than reaching somewhere. It also means the comparison does not
 * depend on which deployment is running.
 *
 * ⚠️ WHY IT MATTERS MORE HERE THAN ON A MARKETING PAGE: this runs on the
 * authentication path (app/auth/callback/route.ts). The link starts on the real
 * domain, the victim really does sign in to the real FaqFlo, and only then gets
 * handed somewhere else — which is the shape phishing wants.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;

  const BASE = 'https://redirect-guard.invalid';

  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    /* An unparseable target is not a target. */
    return fallback;
  }
}
