'use client';

import Link from 'next/link';
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
  const { site } = useDashboard();
  const { job } = useScanJob(site?.id ?? null);

  // Only while there is something to watch. A finished or failed scan is the
  // splash page's business; a banner about it on every page would be nagging.
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
