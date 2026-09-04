'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/*
  Sub-navigation for a screen that owns more than one route.

  The sidebar went from eight destinations to five, which means two pairs of
  routes now share a nav item: Answers owns /faqs and /publish, Opportunities
  owns /questions and /content. Neither pair collapsed into one page, because
  they are genuinely different jobs — writing answers is not pasting them — and
  merging them would have produced two very long screens instead of one clear
  one.

  Real links rather than client-side panel state, deliberately. Every route kept
  its URL, so /dashboard/publish#some-group-id still works from an audit action
  and from the group page's "Get the code" link. Tabs backed by state would have
  broken every one of those.

  The pill treatment is the one already used by the answer filters and
  GeneratorPanel's source toggle; this is that pattern lifted out rather than a
  third version of it.

  ⚠️ THE ACTIVE TAB IS FILLED, NOT WHITE, AND THE COLOUR IS NOT FREE TO CHANGE.
  It was a white pill on the grey field, which read as an unlit switch — you had
  to compare three labels' weight to work out where you were. `bg-primary` with
  `text-white` is 5.17:1 and one of only TWO sanctioned white-on-fill pairs in
  this product (the other is `bg-ink`, 17.04:1). Any other fill here needs
  measuring against white text before it ships; `accent` in particular is 1.9:1
  on white and is fill-only for exactly this reason.

  ⚠️ THE SEGMENTED SHAPE SURVIVED THE BUTTON RESHAPING ON PURPOSE. Buttons in
  the dashboard are 14px now (see the note on SHAPES in components/ui/button.tsx)
  and the pill is meant to be rare. A segmented control is where it still earns
  its keep: the field and the lit segment share one silhouette, which is what
  makes it read as one control with a position rather than three buttons.
*/
export type WorkspaceTab = { href: string; label: string };

export function WorkspaceTabs({
  tabs,
  label,
  activeHref,
}: {
  tabs: WorkspaceTab[];
  label: string;
  /**
   * Match the active tab on href instead of on the pathname.
   *
   * Needed by toggles whose views live in a query param rather than a route:
   * the audit's Plain English / Technical detail switch is one path with two
   * `?view=` values, so pathname matching would light up both tabs or neither.
   * The caller already knows which view it resolved, so it says.
   */
  activeHref?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="mb-6">
      {/* ⚠️ flex-wrap, NOT inline-flex ALONE. Three labels at 320px was already
          borderline, and a fourth tab or a longer word would have pushed one off
          the edge with no way to reach it. Wrapping is the failure mode that
          still works. */}
      <ul className="bg-cloud border-line inline-flex flex-wrap items-center gap-1 rounded-2xl border p-1 sm:rounded-full">
        {tabs.map((tab) => {
          const active = activeHref !== undefined ? tab.href === activeHref : pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-full px-4 py-1.5 text-sm transition-all duration-200 sm:min-h-0 ${
                  active
                    ? 'bg-primary shadow-soft font-semibold text-on-primary'
                    : 'text-slate hover:text-navy'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/*
  ⚠️ ANSWER_TABS AND ITS TWO HELPERS LIVE IN lib/dashboard/answers-tabs.ts, NOT
  HERE, AND MOVING THEM BACK BREAKS THE ANSWERS PAGE.

  This module carries 'use client', and that directive applies to the MODULE,
  not to the component in it — so every export from it is a client reference.
  app/(app)/dashboard/faqs/page.tsx reads `?tab=` during a server render and
  calls answersTabFrom() on it, which failed with "attempted to call
  answersTabFrom() from the server but answersTabFrom is on the client".

  The other two sets below stay put because only client components read them.
*/

export const OPPORTUNITY_TABS: WorkspaceTab[] = [
  { href: '/dashboard/questions', label: 'Questions' },
  { href: '/dashboard/content', label: 'Pages & topics' },
];

/*
  The audit's two readings of one report — same findings, different vocabulary.

  Plain English is the bare URL because it is the default. A business owner who
  arrives with no query string should get the view written for them, and the
  param should only ever be present when someone has deliberately asked for the
  technical detail.
*/
export const AUDIT_TABS: WorkspaceTab[] = [
  { href: '/dashboard/audit', label: 'Plain English' },
  { href: '/dashboard/audit?view=technical', label: 'Technical detail' },
];
