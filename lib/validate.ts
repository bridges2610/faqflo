/**
 * Input checks shared by more than one entry point.
 *
 * `looksLikeEmail` was a module-private function inside lib/auth/actions.ts,
 * which is `'use server'` — and everything a `'use server'` module exports
 * becomes a POST endpoint, so Next refuses any export that is not an async
 * function (see the block comment there, and scripts/check-use-server.mjs).
 * That meant the second caller that wanted it — the public done-for-you
 * enquiry route — could not import it and would have carried its own regex.
 *
 * Two copies of "is this an email" is two chances to accept something one
 * side rejects, and the way a customer finds out is a form that fails on
 * submit for a reason nothing on screen explains. Same argument as
 * lib/support.ts, which exists so a <select> and the route that validates it
 * cannot drift.
 *
 * No imports on purpose: this has to stay reachable from a server action, a
 * route handler and a client component alike.
 */

/** Deliberately loose. Delivery is the real check — this only catches typos. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Does this look like a website someone typed?
 *
 * Just as loose, and for the same reason: the enquiry form asks for a domain
 * so a reply has somewhere to start, not so a machine can fetch it. Anything
 * with a dot and no spaces is enough — rejecting "acme.co.uk/services" or
 * "www.acme.co" for being the wrong shape would fail a person who gave us
 * exactly what we asked for.
 */
export function looksLikeWebsite(value: string): boolean {
  const trimmed = value.trim().replace(/^https?:\/\//i, '');
  return /^[^\s.]+\.[^\s]+$/.test(trimmed);
}
