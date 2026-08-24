import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteRow } from '@/lib/supabase/types';

/**
 * The weekly check schedule — one date per site, moved forward as it fires.
 *
 * ⚠️ THIS REPLACED A MILESTONE TABLE, AND THE SHAPE CHANGE IS THE POINT.
 *
 * Get Cited promised four checks on four named days (7, 30, 60, 90) inside a
 * fixed window, so the schedule was FINITE and had to be materialised: four rows
 * per site, each needing a status, because "was this specific promised check
 * delivered?" is a question rows can answer and a date cannot. It also needed a
 * 'skipped' status, so that an existing customer's already-passed milestones did
 * not all fire at once the moment the feature shipped.
 *
 * Pro promises a cadence. There is no list of promised dates to keep score
 * against — what ran is citation_checks.checked_at, and what is next is one
 * column. A milestone table would grow by one row per site per week, forever, to
 * store a fact that is already implied by "a week after the last one".
 *
 * ⚠️ NEITHER FUNCTION HERE IS THE ONLY WRITER. lib/stripe/fulfil.ts sets and
 * clears the cursor on every subscription event, and claim_due_checks() (0012)
 * moves it forward as it fires. These two exist for the paths that are not a
 * subscription event: a repair, and a site being deleted or handed back.
 */

/** Start the weekly cadence for one site, from now. Idempotent by intent. */
export async function scheduleNextCheck(siteId: string, from: Date = new Date()): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: from.toISOString() })
    .eq('id', siteId);

  if (error) console.error(`Could not schedule checks for site ${siteId}:`, error.message);
}

/**
 * Stop the weekly cadence for one site.
 *
 * ⚠️ NOT THE ONLY THING STANDING BETWEEN A LAPSED ACCOUNT AND A BILL, and it
 * must not become that. claim_due_checks() joins profiles and requires
 * plan = 'pro' on every sweep precisely so that a cursor left behind by a
 * failed clear costs nothing. This is tidiness; the join is the guard.
 */
export async function clearSchedule(siteId: string): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: null })
    .eq('id', siteId)
    .not('next_check_at', 'is', null);

  if (error) console.error(`Could not clear the schedule for site ${siteId}:`, error.message);
}

/**
 * Put back a check that was claimed but could not be enqueued.
 *
 * claim_due_checks() moves the cursor forward as it hands out work, which is
 * what makes two overlapping sweeps safe. The cost is that a refusal downstream
 * — a scan already running for this site, most often — would otherwise silently
 * cost the customer a week. This is the analogue of the milestone runner
 * resetting a row to 'pending' rather than marking it failed.
 *
 * ⚠️ Deliberately `now()` rather than the original due date. The refusal that
 * brings us here is nearly always "a job is already live for this site", and
 * re-arming to a moment in the past means the next sweep claims it again, hits
 * the same live job, and loops until that job finishes. Today, once.
 */
export async function rearmCheck(siteId: string): Promise<void> {
  await scheduleNextCheck(siteId);
}

/** The sites the sweep is about to run, for logging. Read-only. */
export type ClaimedSite = Pick<SiteRow, 'id' | 'user_id' | 'domain' | 'next_check_at'>;
