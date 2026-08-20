import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { expiryFrom, milestoneSchedule } from '@/lib/dashboard/plans';
import type { SiteRow } from '@/lib/supabase/types';

/**
 * The schedule of checks a Get Cited site is owed, materialised into rows.
 *
 * ⚠️ ONE FUNCTION WRITES THESE ROWS, AND IT IS THE BACKFILL TOO. It runs from
 * three places — Stripe fulfilment when a site is bought, the daily sweep with
 * no argument, and any manual repair — and all three are the same code because
 * the alternative is a data migration that is written once, run once, and wrong
 * the first time somebody needs it again.
 *
 * ⚠️ EVERY INSERT IS `on conflict do nothing` AGAINST unique (site_id, day).
 * That constraint is what makes running this on every sweep free: a site whose
 * rows exist gets four no-ops rather than four more checks.
 *
 * The status is decided HERE, at insert time, and never recomputed:
 *
 *   due already passed  → 'skipped'   an existing customer's day 7 and day 30
 *                                     must not fire in a burst the moment this
 *                                     ships. They were never promised a check
 *                                     on a date that has gone.
 *   due after expiry    → 'skipped'   a site grandfathered at 30 days never
 *                                     reaches day 60, and a row that says
 *                                     'pending' forever is a lie the sweep would
 *                                     re-read every night.
 *   otherwise           → 'pending'
 */
export type EnsureResult = { inserted: number; sites: number };

export async function ensureMilestones(siteId?: string): Promise<EnsureResult> {
  const db = createAdminClient();

  let query = db
    .from('sites')
    .select('id, user_id, get_cited_at, get_cited_expires_at')
    .not('get_cited_at', 'is', null);

  if (siteId) query = query.eq('id', siteId);

  const { data, error } = await query;

  if (error) {
    console.error('Could not read sites for the tracking schedule:', error.message);
    return { inserted: 0, sites: 0 };
  }

  const sites = (data ?? []) as Pick<
    SiteRow,
    'id' | 'user_id' | 'get_cited_at' | 'get_cited_expires_at'
  >[];

  const now = new Date();
  const rows: {
    site_id: string;
    user_id: string;
    day: number;
    due_at: string;
    status: 'pending' | 'skipped';
  }[] = [];

  for (const site of sites) {
    if (!site.get_cited_at) continue;

    const expiry = expiryFrom(site.get_cited_at, site.get_cited_expires_at);

    for (const { day, dueAt } of milestoneSchedule(site.get_cited_at)) {
      const past = dueAt <= now;
      const beyondWindow = Boolean(expiry && dueAt > expiry);

      rows.push({
        site_id: site.id,
        user_id: site.user_id,
        day,
        due_at: dueAt.toISOString(),
        status: past || beyondWindow ? 'skipped' : 'pending',
      });
    }
  }

  if (rows.length === 0) return { inserted: 0, sites: sites.length };

  /*
    ignoreDuplicates is the whole safety property — without it this is an upsert
    that would reset a 'done' milestone to 'pending' on the next sweep and re-run
    a check somebody already paid for.
  */
  const { data: inserted, error: insertError } = await db
    .from('tracking_milestones')
    .upsert(rows, { onConflict: 'site_id,day', ignoreDuplicates: true })
    .select('id');

  if (insertError) {
    console.error('Could not write the tracking schedule:', insertError.message);
    return { inserted: 0, sites: sites.length };
  }

  return { inserted: inserted?.length ?? 0, sites: sites.length };
}

/**
 * Drop the checks a site has not had yet.
 *
 * For the refund path: `get_cited_at` is cleared, so the entitlement is gone and
 * a pending milestone would otherwise still fire and spend on a customer who has
 * their money back. Completed rows stay — they are the record of work that was
 * really done, and deleting them would make the chart disagree with the checks
 * table it is drawn from.
 */
export async function cancelPendingMilestones(siteId: string): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('tracking_milestones')
    .delete()
    .eq('site_id', siteId)
    .in('status', ['pending']);

  if (error) console.error(`Could not cancel milestones for site ${siteId}:`, error.message);
}
