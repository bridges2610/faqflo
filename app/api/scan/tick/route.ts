import { NextResponse } from 'next/server';
import { siteOrigin } from '@/lib/auth/origin';
import { createAdminClient } from '@/lib/supabase/admin';
import { NEXT_STAGE, runStage, ScanFailed, type ScanJob } from '@/lib/scan/run';

/*
  Advance one onboarding scan by one slice.

  ⚠️ THIS ROUTE TAKES NO ARGUMENTS AND TRUSTS NO CALLER. It does not accept a
  job id, a site id or a user id, because anything it accepted would be an
  instruction to spend money on somebody else's behalf — a crawl, an Opus call
  and up to fifteen search-backed engine calls per invocation. It picks the
  oldest claimable job itself and runs a bounded slice of it. The worst a
  stranger can do by hitting it is make us do work we had already decided to do.

  ⚠️ WHY THE SELF-CHAIN AT THE BOTTOM. There is no queue and no scheduler in
  this project, and `after()` does not help — lib/tracking/run.ts:16 already
  established that it runs after the response but inside the same invocation, so
  it cannot buy more wall clock. Firing an unawaited request to ourselves starts
  a genuinely new invocation, which is the only way a scan continues once the
  customer has closed the tab.

  It is best-effort by nature, and that is acceptable because the JOB ROW is the
  source of truth rather than the chain. A dropped link stalls a job; it cannot
  corrupt one. The stall is recovered by the next poll from the splash page, by
  the next visit to the dashboard, or by a cron sweep if the project ever moves
  to a Vercel plan that has one — at which point this route is the thing the
  cron calls, unchanged.
*/

/**
 * How long a slice may hold a job before another runner may take it.
 *
 * Comfortably longer than the platform's own request ceiling, so a slice that
 * is merely slow is never stolen from — only one that has genuinely died.
 */
const LEASE_SECONDS = 120;

/**
 * Stop a runaway chain.
 *
 * A bug that left a stage returning `done: false` forever would otherwise
 * re-invoke this route until something else broke. Tracking is the only
 * multi-slice stage and needs about seven passes for a full list, so this is
 * generous by a wide margin and still finite.
 */
const MAX_SLICES = 40;

export async function POST() {
  const db = createAdminClient();

  /*
    Claim by lease.

    ⚠️ THE DATABASE DOES THE CLAIMING, NOT THIS CODE. claim_scan_job() takes the
    oldest free job with FOR UPDATE SKIP LOCKED and stamps a lease on it in one
    statement. Reading a job here and then marking it running would leave a gap
    in which two callers both believe they own it, and both would start crawling
    the customer's site.

    SKIP LOCKED rather than a plain conditional update because concurrent ticks
    are the normal case, not the exception: the splash page pokes this endpoint
    on every poll while the runner is already chaining itself. With SKIP LOCKED
    the second caller takes a DIFFERENT job; with a conditional update it would
    take nothing and the invocation would be wasted.

    The lease is also what recovers a crashed slice. A runner that died
    mid-flight left its lease behind, and once that lease is in the past the row
    is claimable again — nothing has to notice the failure for it to heal.
  */
  const { data, error: claimError } = await db.rpc('claim_scan_job', {
    lease_seconds: LEASE_SECONDS,
  });
  const claimed = data as Partial<ScanJob> | null;

  if (claimError) {
    console.error('Could not claim a scan job:', claimError);
    return NextResponse.json({ error: 'Could not claim a scan job.' }, { status: 502 });
  }

  /*
    ⚠️ CHECKED BY `id`, NOT BY TRUTHINESS, AND THAT DISTINCTION IS LOAD-BEARING.

    The function returns a composite type. When it finds nothing it returns SQL
    NULL, but PostgREST renders a null composite as an OBJECT WITH EVERY FIELD
    NULL — `{"id":null,"stage":null,…}` — not as JSON null. That object is
    truthy.

    A plain `if (!job)` therefore treated "nothing to do" as a live job: no
    stage matched, the slice counter read 1 from a null `progress` every time
    so MAX_SLICES never bit, and the handler chained to itself again. An idle
    queue would have spun invocations against this endpoint indefinitely.

    Verified against the live database rather than assumed — calling the
    function with an empty table returns exactly that all-null shape.
  */
  const job = claimed && typeof claimed.id === 'string' ? (claimed as ScanJob) : null;

  // Nothing to do is the normal resting state, not a problem. Said plainly so a
  // cron hitting this every minute does not fill the logs with errors.
  if (!job) return NextResponse.json({ idle: true });

  const slices = Number((job.progress as { slices?: number })?.slices ?? 0) + 1;

  try {
    const result = await runStage(db, job);
    const stage = result.done ? NEXT_STAGE[job.stage] : job.stage;
    const finished = stage === 'done';

    await db
      .from('scan_jobs')
      .update({
        stage,
        status: finished ? 'done' : 'running',
        // Merged, not replaced: each stage reports its own counters and the
        // splash shows what earlier stages found while a later one is running.
        progress: { ...job.progress, ...result.progress, slices, stage },
        // Released so a stall is claimable immediately rather than after the
        // full lease — the job is between slices, not being worked on.
        lease_until: null,
        updated_at: new Date().toISOString(),
        finished_at: finished ? new Date().toISOString() : null,
      })
      .eq('id', job.id);

    /*
      Close the milestone when its job is done.

      ⚠️ THE ID COMES OFF THE CLAIMED ROW, NOT OFF THE REQUEST. This route takes
      no arguments and trusts no caller, and a milestone id accepted from a body
      would be an instruction to mark somebody else's check complete.

      `finished_at` is stamped here rather than derived from the due date later:
      the sweep is daily and can be late, so this is the only record of when the
      check actually happened, and it is what every screen shows.
    */
    if (finished && job.milestone_id) {
      await db
        .from('tracking_milestones')
        .update({
          status: 'done',
          checks_written: Number((result.progress as { checked?: number })?.checked ?? 0) || null,
          finished_at: new Date().toISOString(),
          job_id: job.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.milestone_id);
    }

    if (!finished && slices < MAX_SLICES) await chain();

    return NextResponse.json({ stage, done: finished, progress: result.progress });
  } catch (err) {
    /*
      ⚠️ A FAILED STAGE STOPS THE JOB, IT DOES NOT RETRY FOREVER.

      ScanFailed means the stage decided it cannot succeed — an unreachable
      site, a refused model call, a site row that no longer exists. Retrying
      those spends money to reach the same conclusion. The row keeps the reason
      so the splash can say what went wrong rather than spinning, and the
      customer's earlier stages are already stored and still theirs.
    */
    const message =
      err instanceof ScanFailed ? err.message : 'Something went wrong during your scan.';
    if (!(err instanceof ScanFailed)) console.error('Scan slice failed:', err);

    await db
      .from('scan_jobs')
      .update({
        status: 'failed',
        error: message,
        lease_until: null,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    /*
      A failed scheduled check is recorded as failed and NOT retried, for the
      same reason the job above is not: retrying spends money to reach the same
      conclusion. The customer sees "the day-30 check didn't complete" with the
      reason, which is better than a gap in the line they have to guess at — and
      whatever the check did collect before it stopped is already stored.
    */
    if (job.milestone_id) {
      await db
        .from('tracking_milestones')
        .update({
          status: 'failed',
          error: message,
          finished_at: new Date().toISOString(),
          job_id: job.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.milestone_id);
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Start the next slice in a new invocation.
 *
 * ⚠️ THE FETCH IS NOT AWAITED, THOUGH THE ORIGIN LOOKUP IS. Awaiting the
 * request would mean this slice waits for the whole rest of the scan — the
 * chain would collapse into one call and hit the timeout it exists to escape.
 * Only `siteOrigin()` is awaited, because it reads the request headers and must
 * do so before the handler returns.
 *
 * ⚠️ siteOrigin() rather than NEXT_PUBLIC_SITE_URL directly. That variable is
 * optional and unset in local development, so reading it alone would make the
 * chain a silent no-op on localhost — the scan would complete its first slice
 * and stop, looking like a hang. siteOrigin() falls back to the request headers
 * and then to localhost, which is what makes this testable at all.
 *
 * The failure is swallowed on purpose: this request's work is already stored,
 * and an unhandled rejection here would turn a successful slice into a 500.
 */
async function chain(): Promise<void> {
  try {
    const base = await siteOrigin();
    void fetch(`${base}/api/scan/tick`, { method: 'POST' }).catch(() => {});
  } catch {
    // No origin means no chain. The job row still holds the place, and the
    // splash page's polling will move it along.
  }
}
