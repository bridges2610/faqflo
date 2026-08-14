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
  and from GroupCard's "Get the code" link. Tabs backed by state would have
  broken every one of those.

  The pill treatment is the one already used by GroupCard's filter and
  GeneratorPanel's source toggle; this is that pattern lifted out rather than a
  third version of it.
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
      <ul className="bg-cloud border-line inline-flex items-center gap-1 rounded-full border p-1">
        {tabs.map((tab) => {
          const active = activeHref !== undefined ? tab.href === activeHref : pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? 'text-navy shadow-soft bg-white font-semibold'
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

/** The two pairs, declared once so both members of a pair agree on the set. */
export const ANSWER_TABS: WorkspaceTab[] = [
  { href: '/dashboard/faqs', label: 'Write' },
  { href: '/dashboard/publish', label: 'Publish' },
];

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
