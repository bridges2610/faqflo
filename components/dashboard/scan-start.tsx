'use client';

import { useDashboard } from '@/lib/dashboard/provider';
import { ScanProgress, ScanStartEmpty } from './scan-progress';

/**
 * Picks what the setup page shows.
 *
 * Split from ScanProgress so that component can take a site id and do one job.
 * The provider is the only thing that knows which site is selected, and it does
 * not resolve until its own load effect has run — so this waits rather than
 * flashing "no scan is running" at somebody whose scan is running fine.
 */
export function ScanStart() {
  const { site, loading, loadError } = useDashboard();

  // The shell already renders the failure panel above this, so saying anything
  // here would be a second, quieter version of the same news.
  if (loading || loadError) return null;
  if (!site) return <ScanStartEmpty />;

  return <ScanProgress siteId={site.id} />;
}
