/**
 * Turning what someone typed into the string we store.
 *
 * Its own module, and pure on purpose. This lives on both sides of the app:
 * the site form uses it to show what will be saved, and the checkout route
 * uses it to find-or-create a site from a domain carried over from the home
 * page scan. Those two MUST agree — if the form stores `acme.com` and checkout
 * looks up `www.acme.com`, the buyer gets a duplicate site and pays to set up
 * the empty one.
 *
 * It used to live in lib/dashboard/store.ts, which reaches for the browser
 * Supabase client at import time. A server route importing it from there would
 * drag that in, so the function moved rather than being copied — a second copy
 * is exactly how the two sides drift apart.
 */

/**
 * Bare hostname: no scheme, no path, no case.
 *
 * ⚠️ `www.` is deliberately NOT stripped. It is part of the hostname the
 * customer gave us, some sites genuinely serve different content there, and
 * the audit fetches whatever this returns. Stripping it would silently audit a
 * different address than the one on screen. The `(user_id, domain)` unique
 * index treats the two as separate sites, which is the honest answer.
 */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}
