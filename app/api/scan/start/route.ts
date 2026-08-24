import { NextResponse } from 'next/server';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';
import { enqueueScan, hasScanned } from '@/lib/scan/enqueue';

/*
  Ask for a scan — a re-run, or a first one that never got queued.

  ⚠️ THIS EXISTS BECAUSE THE OTHER PATH FAILED ONCE, IN FRONT OF A CUSTOMER.
  Onboarding queues the scan the moment a site is created, and its failures are
  logged rather than thrown. The consequence is that a failed enqueue is silent,
  and what the customer gets is an account, an empty dashboard, and no button
  anywhere that would start the thing they came for. That happened: the
  scan_jobs table did not exist yet, the error printed as `{}`, and the flow
  simply stopped.

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

  /*
    ⚠️ THE FREE TIER GETS ONE SCAN, AND THIS IS WHERE THAT IS TRUE RATHER THAN
    MERELY DISPLAYED.

    A scan is the expensive end of the product: a crawl, an Opus discovery call,
    and five questions across three search-backed engines. Free buys exactly one
    of those, taken automatically at signup. The UI shows an upgrade card instead
    of a button, but a POST straight to this endpoint is one line of fetch, and
    the cost of getting this wrong is a loop somebody else pays for.

    Pro re-runs freely — that is most of what it sells — bounded by its own
    monthly check meter in app/api/dashboard/tracking/route.ts and lib/scan/run.ts.
  */
  if (!isPro(user) && (await hasScanned(site.id))) {
    return fail(
      'Your free check has already run. Pro re-checks your site every week, and whenever you ask.',
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
