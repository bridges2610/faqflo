import 'server-only';

import { redirect } from 'next/navigation';
import { currentUser } from './dal';
import { isPro } from './entitlements';

/*
  Send a free account back to its report.

  The free plan is one page. Everything else in the dashboard belongs to Pro, so
  a free account arriving at one — from an old bookmark, a link in a blog post,
  or the URL bar — lands on /dashboard rather than on a page of upgrade cards or
  a 404.

  ⚠️ CALLED PER ROUTE, AND THE TWO OBVIOUS ALTERNATIVES BOTH FAIL.

  Not proxy.ts: its header states the signed-in check "cannot be more than [a
  valid token] — the docs are clear that proxy runs on every request including
  prefetches and must not do database work", and records the ERR_TOO_MANY_-
  REDIRECTS incident that followed when it and the DAL disagreed. `plan` lives
  on the profiles row and not in the JWT — fromClaims() hardcodes 'free' — so
  checking it there is exactly the database read that comment forbids.

  Not app/(app)/layout.tsx either, which looks ideal because it already awaits
  requireUser() and holds the whole row. A server layout is not given the
  pathname, so it cannot let /dashboard through while redirecting its siblings.

  ⚠️ COSTS NO QUERY. currentUser() is React cache()-wrapped and the (app) layout
  has already awaited it in this request, so this is a second read of the same
  row.

  ⚠️ IT FAILS THE WRONG WAY, AND THAT IS WORTH KNOWING. fromClaims() returns
  plan: 'free' when the profile row cannot be read. For an entitlement that
  fails closed, which is right — you lose a feature you paid for until the read
  recovers. For a REDIRECT it means a transient database blip bounces a paying
  customer off the page they were on, which reads as the app breaking rather
  than as a permission. It is the same fallback the whole entitlement system
  uses so it stays consistent for now; if it ever proves flaky, this needs to
  tell "definitely free" apart from "could not tell" and let the second case
  through.
*/
export async function requirePro(): Promise<void> {
  const user = await currentUser();
  if (!isPro(user)) redirect('/dashboard');
}
