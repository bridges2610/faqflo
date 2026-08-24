import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { siteOrigin } from '@/lib/auth/origin';
import { enqueueTrackingJob } from '@/lib/scan/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import { rearmCheck, type ClaimedSite } from '@/lib/tracking/schedule';

/*
  The scheduler. Once a day, fire the weekly checks that have come due.

  ⚠️ THIS ROUTE MAKES NO ENGINE CALLS. It finds work and hands it to the machinery
  that already exists — scan_jobs, its lease, and /api/scan/tick, which slices
  five questions at a time and chains itself. app/api/scan/tick has said so
  since it was written: "a cron sweep if the project ever moves to a Vercel plan
  that has one — at which point this route is the thing the cron calls,
  unchanged." This is that cron.

  Doing the work inline instead would mean up to 25 sites × 25 questions × 3
  engines in one invocation, against a 60-second ceiling. It would time out on
  the first customer.

  ⚠️ DAILY FOR A WEEKLY CADENCE, AND THAT IS NOT A MISMATCH. Due-ness is
  `next_check_at <= now()`, so this is a sweep rather than an alarm clock: it
  runs every night, finds the roughly one-seventh of sites whose week is up, and
  ignores the rest. A missed night, or Vercel's ±59-minute scheduling slop on the
  Hobby tier, delays a check rather than dropping it.

  ⚠️ AND A MISSED MONTH DOES NOT FIRE A MONTH OF CHECKS. claim_due_checks()
  clamps the next date forward to at least now(), so an outage means skipped
  weeks rather than a backlog spent in one afternoon. See 0012.
*/

export const dynamic = 'force-dynamic';

/** The chain below is unawaited, so this needs only enough time to enqueue. */
export const maxDuration = 60;

/**
 * How many sites one sweep may claim.
 *
 * Each claimed site becomes a queued job, not work done here, so this bounds the
 * burst rather than the runtime. The rest keep until tomorrow: their cursors are
 * untouched by a sweep that never reached them, so they stay due.
 */
const CLAIM_LIMIT = 25;

/**
 * Compare without leaking the secret through timing.
 *
 * Length is compared first because timingSafeEqual throws on a length mismatch,
 * and that throw would itself be the leak.
 */
function secretMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (!header || header.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: Request): Promise<NextResponse> {
  /*
    ⚠️ FAIL CLOSED ON A MISSING SECRET, NOT OPEN.

    An unset CRON_SECRET — a preview deployment, a variable someone forgot to
    add — must not leave a public endpoint that spends money on engine calls for
    every site that looks due. 503 is deliberate: it distinguishes "not
    configured" from "wrong credential" in the Vercel logs, which is the
    difference between an env var to add and an attacker to worry about.

    ⚠️ AND NOT `x-vercel-cron`. That header is set by the platform, but nothing
    stops a stranger sending one too. The bearer token is the only part of this
    request an outsider cannot forge.
  */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — the tracking scheduler is disabled.');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  if (!secretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const base = await siteOrigin();

  /*
    1. Sweep the job queue first.

    A job whose lease expired overnight — a slice that died mid-flight — is
    claimable again but has nobody to claim it, because the chain that would have
    is what died. One poke costs nothing when the queue is idle (the route
    answers `{ idle: true }`) and rescues a stalled scan when it is not.
  */
  void fetch(`${base}/api/scan/tick`, { method: 'POST' }).catch(() => {});

  /*
    2. Claim what is due, and move each cursor on a week in the same statement.

    SKIP LOCKED, so two sweeps overlapping take different rows rather than one
    blocking on the other. The RPC also re-checks profiles.plan = 'pro', so a
    cursor left behind on a lapsed account claims nothing — the entitlement is
    the guard, not the cursor. See 0012.

    There is no "materialise the schedule" step any more. Milestones had to be
    written into rows before they could be claimed; a cursor is set once, by the
    subscription event that starts the plan.
  */
  const { data, error } = await db.rpc('claim_due_checks', { limit_count: CLAIM_LIMIT });

  if (error) {
    console.error('Could not claim due checks:', error.message);
    return NextResponse.json({ error: 'Could not claim checks' }, { status: 502 });
  }

  const claimed = (data ?? []) as ClaimedSite[];
  let queued = 0;
  let deferred = 0;

  // 3. One tracking job each.
  for (const site of claimed) {
    const result = await enqueueTrackingJob(site.id, site.user_id);

    if (result.ok && result.created) {
      queued += 1;
      continue;
    }

    /*
      ⚠️ RE-ARMED FOR TOMORROW, NOT LOST.

      A refused insert means another scan is already live for that site — an
      onboarding scan, or last week's check still working through its slices.
      Nothing has gone wrong and nothing has been checked, but the claim has
      already pushed this site's cursor a week into the future, so doing nothing
      here would silently cost the customer a check they are paying for.

      rearmCheck() sets it back to now(), which tomorrow's sweep picks up. Not to
      the original due date: the live job that refused us may still be running
      then, and a cursor in the past would be re-claimed on every sweep until it
      finishes.
    */
    await rearmCheck(site.id);
    deferred += 1;
  }

  // One poke to start the chain on whatever was queued. Unawaited, like the
  // tick route's own chain: awaiting it would mean this sweep waits for every
  // check it just scheduled.
  if (queued > 0) void fetch(`${base}/api/scan/tick`, { method: 'POST' }).catch(() => {});

  return NextResponse.json({ claimed: claimed.length, queued, deferred });
}
