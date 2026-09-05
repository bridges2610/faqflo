import { NextResponse } from 'next/server';
import { siteOrigin } from '@/lib/auth/origin';
import type { TopFix } from '@/lib/email/templates';
import { welcomeOnce } from '@/lib/email/welcome';
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

    /*
      ⚠️ THE ERROR ON THIS WRITE IS READ, AND IT USED TO BE DROPPED ON THE FLOOR.

      supabase-js returns `{ error }` rather than throwing, so a rejected UPDATE
      here landed as a value nobody looked at. The catch block below never saw
      it and the code carried straight on to chain another slice.

      That is not theoretical, and the shape of it is worth recording. When the
      'topics' stage was added, scan_jobs.stage still carried the four-value
      check constraint from 0010 until 0022 was applied. The advancing write was
      refused every time, the row stayed at `stage = 'questions'` with
      `status = 'running'`, and two minutes later the expired lease made it
      claimable again — whereupon the questions stage reported "already done"
      and the same write failed again. An infinite loop that never reported
      `done`, never reported `failed`, and left tracking unrun, so the customer's
      dashboard stayed empty with the job apparently still working.

      A write that cannot land is exactly the "this stage cannot succeed" case
      the catch block already handles well. It just arrived by the one path that
      was not being watched. Throwing it makes the two paths one.
    */
    const { error: writeError } = await db
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

    if (writeError) {
      /* Logged with the stage that could not be written, because the useful
         question on seeing this is always "which value was refused". */
      console.error(`Scan job ${job.id} could not advance to '${stage}':`, writeError.message);
      throw new ScanFailed('Your scan could not be saved. Please try again.');
    }

    /*
      Tell them it's ready — once, on the first scan a site ever completes.

      ⚠️ THIS MOVED HERE FROM STRIPE FULFILMENT, AND THE TRIGGER CHANGED WITH IT.
      The "your site is set up" email used to send the moment a $129 payment
      landed, gated on whether that call was the one that granted it. There is no
      payment at this point any more — every free signup gets a scan — so the
      thing worth announcing is not that money moved, it is that the results
      exist. Sending it at signup instead would promise a dashboard that is still
      three stages from having anything in it.

      ⚠️ THE ID COMES OFF THE CLAIMED ROW, NOT OFF THE REQUEST. This route takes
      no arguments and trusts no caller.
    */
    /* ⚠️ THE MERGED PROGRESS, NOT `job`. `job` was read at the start of this
       slice, so its progress is missing whatever this slice just produced — the
       same object written immediately above. Passing `job` meant the final
       slice's counters were always one behind in the email. */
    if (finished) await announceIfFirst(db, job, { ...job.progress, ...result.progress });

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
      ⚠️ NO SEPARATE MILESTONE ROW TO MARK FAILED ANY MORE, and nothing is lost.

      A scheduled check used to own a row that could say 'failed' with a reason,
      because Get Cited promised four checks on four named days and a customer
      staring at a gap in a four-point timeline deserved to know which one broke.
      A weekly cadence has no such list: scan_jobs.error above already carries
      the reason, the Results page shows it, and next week's sweep tries again on
      its own because the cursor moved forward regardless.
    */
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Send the "your site is ready" email, but only after a site's FIRST scan.
 *
 * ⚠️ CANNOT THROW, AND THAT IS LOAD-BEARING. This runs after the slice's work is
 * already written. An exception here would turn a completed scan into a 502 and
 * a `failed` job row the customer would see, for the sake of an email. Mail is a
 * courtesy; it does not get a vote on whether the scan succeeded.
 *
 * ⚠️ "FIRST" IS COUNTED FROM scan_jobs, NOT FROM A FLAG. Pro re-runs weekly, so
 * a per-completion send would mail somebody every Tuesday forever. Counting the
 * site's jobs is exact and needs no new column: this job is already inserted, so
 * a count of 1 means it is the only one there has ever been.
 *
 * The Resend idempotency key is a second belt on top of that — two slices
 * racing to finish the same job would both count 1.
 */
async function announceIfFirst(
  db: ReturnType<typeof createAdminClient>,
  job: ScanJob,
  progress: Record<string, unknown>,
): Promise<void> {
  try {
    const { count, error } = await db
      .from('scan_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', job.site_id);

    if (error || (count ?? 0) !== 1) return;

    const { data: site } = await db
      .from('sites')
      .select('name')
      .eq('id', job.site_id)
      .maybeSingle<{ name: string }>();

    if (!site?.name) {
      console.error(`No site for the welcome email (job ${job.id}).`);
      return;
    }

    /*
      ⚠️ welcomeOnce, NOT trySendEmail DIRECTLY — AND THE CLAIM IS THE POINT.
      This used to send setUpEmail with an idempotency key of `setup-${job.id}`,
      which is once per JOB. A welcome is an account-level event, and
      welcomed_at (migration 0004) is the column built to arbitrate exactly
      that. It also means the address and name are read inside the claim, so
      there is no window where we read a profile and then fail to mark it.

      ⚠️ ONLY THE FIGURES THE JOB ACTUALLY REPORTED. Each is passed through as
      undefined when absent rather than coerced to 0 — the template drops the
      sentence, because "read 0 pages" is a claim about a crawl that said
      nothing. `score` is deliberately allowed through at 0: a site really can
      score zero, and that is a measurement rather than a gap.
    */
    const p = progress as {
      score?: number;
      pagesRead?: number;
      questions?: number;
      checked?: number;
    };

    /*
      The single highest-ranked fix, so the mail can name what to do rather than
      pointing at a dashboard and hoping.

      ⚠️ BEST EFFORT, AND ITS ABSENCE COSTS NOTHING. The report is a large jsonb
      blob written by the audit stage; an older row, a partial write or a shape
      that has since moved all end up as `null` here and the email simply drops
      that paragraph. It must never be the reason a welcome fails to send —
      which is why it is read separately from the claim rather than inside it.
    */
    let topFix: TopFix | null = null;
    try {
      const { data: run } = await db
        .from('audit_runs')
        .select('report')
        .eq('site_id', job.site_id)
        .not('report', 'is', null)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ report: unknown }>();

      const actions = (run?.report as { actions?: unknown } | null)?.actions;
      const first = Array.isArray(actions) ? actions[0] : null;
      if (
        first &&
        typeof first.what === 'string' &&
        typeof first.why === 'string' &&
        typeof first.effort === 'string'
      ) {
        topFix = { what: first.what, why: first.why, effort: first.effort };
      }
    } catch (err) {
      console.error('Could not read the top fix for the welcome email:', err);
    }

    await welcomeOnce(
      job.user_id,
      site.name,
      {
        score: typeof p.score === 'number' ? p.score : undefined,
        pagesRead: typeof p.pagesRead === 'number' ? p.pagesRead : undefined,
        questions: typeof p.questions === 'number' ? p.questions : undefined,
        /* ⚠️ A BOOLEAN, NOT THE COUNT. `checked` counts question-and-engine
           pairs; printing it told a roofer "75 checks in all", which is our
           plumbing rather than their news. All the reader needs is that the
           engines were actually asked. */
        asked: typeof p.checked === 'number' && p.checked > 0,
      },
      topFix,
    );
  } catch (err) {
    console.error('Welcome email failed (the scan itself is unaffected):', err);
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
