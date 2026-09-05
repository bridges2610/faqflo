'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useDashboard } from '@/lib/dashboard/provider';
import { useScanJob } from '@/lib/dashboard/use-scan-job';
import { ScanMeter, scanStatusLine } from './scan-meter';

/**
 * The first scan, visible from wherever you happen to be.
 *
 * ⚠️ ITS ADVICE IS THE OPPOSITE OF RunNotice'S, AND BOTH ARE CORRECT. That one
 * says "keep this tab open — the check runs from your browser", because
 * runTracking() genuinely drives its loop client-side and closing the tab
 * really does stop it. This work runs server-side against a scan_jobs row, so
 * the tab is free to close. Two banners giving contradictory instructions looks
 * like an inconsistency and is not one; copying the warning across for the sake
 * of matching would throw away the entire reason the job table exists.
 *
 * ⚠️ Shares useScanJob() with the splash page rather than polling separately.
 * With both mounted, two loops would double the read rate and both would poke
 * /api/scan/tick.
 */
export function ScanNotice() {
  const router = useRouter();
  const { site } = useDashboard();
  const { job } = useScanJob(site?.id ?? null);

  /*
    ⚠️ WHEN THE SCAN FINISHES, THE DASHBOARD REFRESHES ITSELF. Nobody should
    have to press reload to see work they watched happen.

    The scan writes server-side, but everything on screen was read BEFORE it
    ran: `sites` is server-rendered by app/(app)/layout.tsx, and the provider
    loads the rest client-side once, keyed on that array. Neither notices a row
    that appeared afterwards, so a customer arriving on their report found the
    empty version of it and had to reload by hand.

    One router.refresh() is enough for all three, and the cascade is worth
    stating because it is not obvious: the layout re-runs → `sites` is a new
    array → the provider's load effect re-keys on it and refetches → its
    loadTracking callback is keyed on `sites` too, so citations reload behind
    the same one call.

    ⚠️ THIS COMPONENT, NOT THE ONBOARDING MODAL, AND THAT IS THE POINT. The
    modal only exists on /dashboard/start. Somebody who wandered to Content
    while the scan ran has exactly the same stale screen and no modal to fix it.
    This is mounted by AppShell on every dashboard page, which is what makes
    "they should just see it" true everywhere rather than on one route.

    ⚠️ ONLY ON A TRANSITION SOMEBODY WATCHED — hence `sawLive`. `job` is the
    site's latest scan, and it stays 'done' for ever, so firing whenever it is
    terminal would re-run the server layout once on every single dashboard load
    for the rest of the account's life. `applied` then keeps it to one refresh
    per session.

    Same guard, and the same reasoning, as `wasFinishedOnMount` in
    onboarding-modal.tsx.
  */
  const sawLive = useRef(false);
  const applied = useRef(false);

  useEffect(() => {
    if (!job || applied.current) return;

    if (job.status !== 'done' && job.status !== 'failed') {
      sawLive.current = true;
      return;
    }

    // Already over when we got here: nothing was missed, so nothing to refetch.
    if (!sawLive.current) return;

    applied.current = true;
    router.refresh();
  }, [job, router]);

  // Only while there is something to watch. A finished or failed scan is the
  // splash page's business; a banner about it on every page would be nagging.
  //
  // ⚠️ AFTER THE HOOKS ABOVE, NOT BEFORE THEM. The refresh has to run on the
  // render where the job turns terminal, which is the same render this stops
  // drawing anything on.
  if (!job || job.status === 'done' || job.status === 'failed') return null;

  return (
    <div className="border-line bg-cloud mb-6 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-navy text-sm font-semibold">
          Setting up {site ? site.name : 'your site'}
        </p>
        <Link
          href="/dashboard/start"
          className="text-primary hover:text-primary-hover text-sm font-semibold"
        >
          View progress
        </Link>
      </div>

      <ScanMeter job={job} className="mt-2" />

      <p className="text-slate mt-2 text-xs">
        {scanStatusLine(job)}. You can close this tab — it keeps running without you.
      </p>
    </div>
  );
}
