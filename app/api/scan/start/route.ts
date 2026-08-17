import { NextResponse } from 'next/server';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canTrack, hasGetCited } from '@/lib/auth/entitlements';
import { enqueueScan } from '@/lib/scan/enqueue';

/*
  Ask for a scan that should already have been queued.

  ⚠️ THIS EXISTS BECAUSE THE OTHER PATH FAILED ONCE, IN FRONT OF A CUSTOMER.
  Stripe fulfilment queues the scan the moment a payment lands, and its failures
  are logged rather than thrown — deliberately, because the webhook claims its
  event before handling it, so a throw would discard the retry and lose the
  grant. The consequence is that a failed enqueue is silent, and what the
  customer gets is a paid account, an empty dashboard, and no button anywhere
  that would start the thing they bought. That happened: the scan_jobs table did
  not exist yet, the error printed as `{}`, and the flow simply stopped.

  So the queue is no longer something only a webhook may fill. Nothing here can
  be used to obtain a scan without paying — the entitlement is checked
  server-side against the owned row, exactly as the tracking route checks it.

  ⚠️ NOT the same endpoint as /api/scan/tick. That one runs work and takes no
  arguments; this one only creates the row. Keeping them apart means the thing
  that spends money on demand still cannot be aimed at a site by its caller.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to start your scan.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { siteId } = (body ?? {}) as Record<string, unknown>;
  if (typeof siteId !== 'string' || !siteId) return fail('A site is required.', 400);

  // 404 rather than 403: confirming an id exists but belongs to someone else
  // tells an attacker their guess was right.
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('No such site on your account.', 404);

  if (!canTrack(site, user)) {
    return fail(
      // Two different customers. One bought and ran out of window; the other
      // never bought.
      hasGetCited(site)
        ? 'This site’s 30 days have ended. Stay Cited starts new checks again.'
        : 'Setting up your site is part of Get Cited.',
      403,
    );
  }

  const result = await enqueueScan(site.id, user.id);
  if (!result.ok) {
    // The detail is the database's own words. It reaches the customer because
    // the alternative — "something went wrong" — is what made the original
    // failure take a database probe to diagnose.
    return fail(`We couldn't start your scan. ${result.error}`, 502);
  }

  return NextResponse.json({ started: true, created: result.created });
}
