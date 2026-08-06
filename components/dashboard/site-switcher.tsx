'use client';

import Link from 'next/link';
import { useDashboard } from '@/lib/dashboard/provider';

/**
 * Which site everything else on the page is about.
 *
 * A plain <select> rather than a custom dropdown: it's keyboard- and
 * screen-reader-correct for free, and on mobile it opens the native picker,
 * which beats anything hand-rolled at this size. With one site it collapses to
 * a static label — a one-option select is a control that does nothing.
 */
export function SiteSwitcher() {
  const { sites, site, selectSite } = useDashboard();

  if (!site) {
    return (
      <Link href="/dashboard/setup" className="text-primary text-sm font-medium">
        Add your first site →
      </Link>
    );
  }

  if (sites.length === 1) {
    return (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-navy truncate text-sm font-semibold">{site.name}</span>
        <span className="text-slate hidden truncate font-mono text-xs sm:inline">
          {site.domain}
        </span>
      </span>
    );
  }

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Site</span>
      <select
        value={site.id}
        onChange={(e) => selectSite(e.target.value)}
        className="border-line text-navy focus:border-primary max-w-[12rem] truncate rounded-input border bg-white px-3 py-1.5 text-sm font-semibold outline-none transition-colors duration-150"
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
