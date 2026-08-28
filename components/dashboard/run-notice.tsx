'use client';

import Link from 'next/link';
import { isPro } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { RunProgress } from './run-progress';

/**
 * A tracking run, visible from wherever you happen to be.
 *
 * ⚠️ ON EVERY PAGE FOR THE SAME REASON THE WINDOW COUNTDOWN IS. A run that only
 * reports on the screen that started it is one you assume died the moment you
 * click away — which is exactly what customers concluded, because the progress
 * genuinely vanished with the unmounted component. The run itself was always
 * fine; nothing was telling them so.
 *
 * ⚠️ AND IT SAYS TO KEEP THE TAB OPEN. The loop lives in the browser: surviving
 * navigation is not surviving a reload, and making it robust against the smaller
 * interruption makes the larger one *less* obvious. Better to name the limit
 * than to let someone discover it by closing the tab at 80%.
 */
export function RunNotice() {
  const { trackingRun, sites, user } = useDashboard();

  if (!trackingRun.busy) return null;

  const site = sites.find((s) => s.id === trackingRun.siteId);

  return (
    <div className="border-line bg-cloud mb-6 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-navy text-sm font-semibold">
          Checking {site ? site.name : 'your site'} against the answer engines
        </p>
        {/*
          ⚠️ PRO ONLY, AND THIS NOTICE ONLY RECENTLY BECAME REACHABLE WITHOUT
          PRO. /dashboard/tracking redirects a free account back to /dashboard,
          so this was a dead link — it just could not be reached, because
          runTracking() was callable only from the Results page, which is
          gated. The free report has a Run button now, so the accident that
          protected it is gone. A free account's results are the report it is
          already looking at, which is why there is no link for it here.
        */}
        {isPro(user) && (
          <Link
            href="/dashboard/tracking"
            className="text-primary hover:text-primary-hover text-sm font-semibold"
          >
            View results
          </Link>
        )}
      </div>

      <RunProgress run={trackingRun} className="mt-2" />

      {/* Both halves matter: what breaks it, and what happens if it does. */}
      <p className="text-slate mt-2 text-xs">
        Keep this tab open — the check runs from your browser. If it stops early, nothing is
        wasted: every answer already collected is saved, and running again asks only for what is
        still missing.
      </p>
    </div>
  );
}
