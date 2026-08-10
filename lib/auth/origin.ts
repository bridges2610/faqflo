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
 * immediately after proving who someone is. Only same-site absolute paths are
 * allowed through — and `//host` is rejected because a protocol-relative URL
 * is a full origin wearing a path's clothes.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
