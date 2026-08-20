import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { siteOrigin } from '@/lib/auth/origin';
import { enqueueTrackingJob } from '@/lib/scan/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureMilestones } from '@/lib/tracking/schedule';
import type { TrackingMilestoneRow } from '@/lib/supabase/types';

/*
  The scheduler. Once a day, fire the checks that have come due.

  ⚠️ THIS ROUTE MAKES NO ENGINE CALLS. It finds work and hands it to the machinery
  that already exists — scan_jobs, its lease, and /api/scan/tick, which slices
  five questions at a time and chains itself. app/api/scan/tick:16-28 has said so
  since it was written: "a cron sweep if the project ever moves to a Vercel plan
  that has one — at which point this route is the thing the cron calls,
  unchanged." This is that cron, and the tick route is unchanged apart from
  writing the outcome back to the milestone.

  Doing the work inline instead would mean up to 25 sites × 15 questions × 3
  engines in one invocation, against a 60-second ceiling. It would time out on
  the third customer.

  ⚠️ DAILY IS ENOUGH, AND LATE IS NOT LOST. Due-ness is `due_at <= now()`, so
  this is a sweep rather than an alarm clock: a missed day, or Vercel's
  ±59-minute scheduling slop on the Hobby tier, delays a check rather than
  dropping it. Everything downstream therefore shows a milestone's real
  `finished_at`, never the date it was due — a check that says "day 7" but ran on
  day 9 is a small lie the customer can catch.
*/

export const dynamic = 'force-dynamic';

/** The chain below is unawaited, so this needs only enough time to enqueue. */
export const maxDuration = 60;

/**
 * How many milestones one sweep may claim.
 *
 * Each claimed milestone becomes a queued job, not work done here, so this
 * bounds the burst rather than the runtime — 25 sites coming due on one day is
 * already an unusual day, and the rest keep until tomorrow because their rows
 * stay 'pending'.
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

  // 2. Materialise any schedule that does not exist yet. Free when it does:
  //    four no-ops against unique (site_id, day).
  const ensured = await ensureMilestones();

  // 3. Claim what is due. SKIP LOCKED, so two sweeps overlapping take different
  //    rows rather than one blocking on the other.
  const { data, error } = await db.rpc('claim_due_milestones', { limit_count: CLAIM_LIMIT });

  if (error) {
    console.error('Could not claim due milestones:', error.message);
    return NextResponse.json({ error: 'Could not claim milestones' }, { status: 502 });
  }

  const claimed = (data ?? []) as TrackingMilestoneRow[];
  let queued = 0;
  let deferred = 0;

  // 4. One tracking job each.
  for (const milestone of claimed) {
    const result = await enqueueTrackingJob(milestone.site_id, milestone.user_id, milestone.id);

    if (result.ok && result.created) {
      await db
        .from('tracking_milestones')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', milestone.id);
      queued += 1;
      continue;
    }

    /*
      ⚠️ BACK TO 'pending', NOT 'failed' AND NOT 'done'.

      A refused insert means another scan is already live for that site — the
      purchase scan, or yesterday's milestone still working through its slices.
      Nothing has gone wrong and nothing has been checked; tomorrow's sweep finds
      the same row due and tries again. Marking it done here would silently drop
      a check the customer was promised, and marking it failed would show them an
      error for a queue that was merely busy.
    */
    await db
      .from('tracking_milestones')
      .update({ status: 'pending', started_at: null, updated_at: new Date().toISOString() })
      .eq('id', milestone.id);
    deferred += 1;
  }

  // One poke to start the chain on whatever was queued. Unawaited, like the
  // tick route's own chain: awaiting it would mean this sweep waits for every
  // check it just scheduled.
  if (queued > 0) void fetch(`${base}/api/scan/tick`, { method: 'POST' }).catch(() => {});

  return NextResponse.json({
    scheduled: ensured.inserted,
    sites: ensured.sites,
    claimed: claimed.length,
    queued,
    deferred,
  });
}
