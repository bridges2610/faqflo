'use client';

import Link from 'next/link';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { isPro } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { SiteIcon } from './site-icon';

/**
 * Which site everything else on the page is about.
 *
 * A plain <select> rather than a custom dropdown: it's keyboard- and
 * screen-reader-correct for free, and on mobile it opens the native picker,
 * which beats anything hand-rolled at this size. With one site it collapses to
 * a static label — a one-option select is a control that does nothing.
 */
export function SiteSwitcher() {
  const { sites, site, selectSite, user } = useDashboard();

  if (!site) {
    return (
      /*
        Was /dashboard/setup, a route that has never existed — so an account
        with no sites clicked "Add your first site" and got a 404.

        ⚠️ AND /dashboard/sites IS NOW A 404 OF ITS OWN FOR FREE, which is the
        same bug wearing a redirect instead of an error page. That route sends a
        free account back to /dashboard, so this link would return them to the
        page they clicked it from. /dashboard/start is where a free account
        actually adds a site, and it is open to both plans.
      */
      <Link
        href={isPro(user) ? '/dashboard/sites' : '/dashboard/start'}
        className="text-primary text-sm font-medium"
      >
        Add your first site →
      </Link>
    );
  }

  if (sites.length === 1) {
    // items-center, not items-baseline: an image has no useful baseline, and
    // the name and domain still line up against each other inside it.
    return (
      <span className="flex min-w-0 items-center gap-2">
        <SiteIcon name={site.name} domain={site.domain} />
        <span className="text-navy truncate text-sm font-semibold">{site.name}</span>
        {/* Only when it adds something. A customer who named the site after its
            domain was getting "letsroof.com  letsroof.com" side by side. */}
        {!isNamedAfterDomain(site.name, site.domain) && (
          <span className="text-slate hidden truncate font-mono text-xs sm:inline">
            {site.domain}
          </span>
        )}
      </span>
    );
  }

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Site</span>
      {/* Beside the control, not inside it: an <option> can't hold an image, so
          this shows the selected site and the select stays native. */}
      <SiteIcon name={site.name} domain={site.domain} />
      <select
        value={site.id}
        onChange={(e) => selectSite(e.target.value)}
        className="border-line text-navy focus:border-primary max-w-48 truncate rounded-input border bg-surface px-3 py-1.5 text-sm font-semibold outline-none transition-colors duration-150"
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
