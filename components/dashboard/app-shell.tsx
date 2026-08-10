'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/ui/wordmark';
import { useDashboard } from '@/lib/dashboard/provider';
import { getCitedDaysLeft, hasGetCited, hasStayCited } from '@/lib/dashboard/plans';
import {
  AeoIcon,
  ChartIcon,
  CloseIcon,
  FaqIcon,
  DocIcon,
  GlobeIcon,
  HomeIcon,
  MenuIcon,
  SearchIcon,
  SetupIcon,
} from './nav-icons';
import { AccountMenu } from './account-menu';
import { SiteSwitcher } from './site-switcher';

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

/* The loop, in order: audit → discover → generate → publish → track. The nav
   is the product's shape, so someone who has never read the marketing page can
   still tell what this thing does from the sidebar alone.

   Content sits after Answers: it's what you do once the questions you already
   have are answered — the pages you're missing, and what to write next. */
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', Icon: HomeIcon },
  { href: '/dashboard/audit', label: 'Audit', Icon: AeoIcon },
  { href: '/dashboard/questions', label: 'Questions', Icon: SearchIcon },
  { href: '/dashboard/faqs', label: 'Answers', Icon: FaqIcon },
  { href: '/dashboard/content', label: 'Content', Icon: DocIcon },
  { href: '/dashboard/publish', label: 'Publish', Icon: SetupIcon },
  { href: '/dashboard/tracking', label: 'Tracking', Icon: ChartIcon },
  { href: '/dashboard/sites', label: 'Sites', Icon: GlobeIcon },
];

/** Overview owns the exact path; the rest own their subtree. */
function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-input px-3 py-2 text-sm transition-colors duration-150 ${
              active
                ? 'bg-primary-soft text-primary font-semibold'
                : 'text-slate hover:text-navy hover:bg-cloud'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The countdown, on every page rather than only where a lock appears.
 *
 * A deadline that is only visible on the screen it will break is a deadline
 * you meet by accident. Seven days is late enough not to nag from day one and
 * early enough to be a decision rather than an interruption.
 *
 * Shown once the window has ended too — at that point it is the explanation
 * for why things stopped, and without it the product just looks broken.
 */
function WindowNotice() {
  const { site, user } = useDashboard();

  // A subscriber's sites do not expire, so there is nothing to count down to.
  if (!site || hasStayCited(user) || !hasGetCited(site)) return null;

  const left = getCitedDaysLeft(site);
  if (left === null || left > 7) return null;

  const ended = left <= 0;

  return (
    <div
      className={`mb-6 rounded-xl border p-4 ${
        ended ? 'border-line bg-cloud' : 'border-accent bg-accent-soft'
      }`}
    >
      <p className="text-navy text-sm font-semibold">
        {ended
          ? `Your Get Cited window for ${site.name} has ended`
          : `${left} ${left === 1 ? 'day' : 'days'} left on Get Cited for ${site.name}`}
      </p>
      <p className="text-slate mt-1 text-sm leading-relaxed">
        {ended
          ? 'Everything already made is still yours — the audit, the answers and the export. Stay Cited starts them running again.'
          : 'After that you keep everything made so far, and new audits pause. Stay Cited keeps them running across every site.'}{' '}
        <Link href="/dashboard/tracking" className="text-primary hover:text-primary-hover font-semibold">
          See Stay Cited →
        </Link>
      </p>
    </div>
  );
}

/**
 * What this account owns, pinned to the bottom of the sidebar.
 *
 * Says both scopes explicitly, because they're different: Get Cited is counted
 * per site, Stay Cited is on or off for the whole account.
 */
function PlanFooter() {
  const { sites, user } = useDashboard();

  const setUp = sites.filter((s) => s.getCitedAt).length;
  const tracking = hasStayCited(user);

  return (
    <div className="border-line bg-cloud rounded-xl border p-4">
      <p className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Your account</p>
      <p className="text-navy mt-1 text-sm font-semibold">
        {setUp} of {sites.length} {sites.length === 1 ? 'site' : 'sites'} set up
      </p>
      <p className="text-slate mt-1 text-xs leading-relaxed">
        {tracking ? 'Stay Cited is active' : 'Tracking is off'}
      </p>
      {!tracking && (
        <Link
          href="/#pricing"
          className="text-primary hover:text-primary-hover mt-3 inline-block text-xs font-semibold"
        >
          Add Stay Cited →
        </Link>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useDashboard();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A route change closes the drawer; without this it would stay open over the
  // page the user just navigated to.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Escape closes it too — it's a modal overlay, and modal overlays that trap
  // you until you find the X are a bug.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Sidebar — permanent from lg up */}
      <aside className="border-line hidden w-64 shrink-0 flex-col justify-between border-r bg-white p-5 lg:flex">
        <div>
          <Wordmark className="text-[1.25rem]" />
          <div className="mt-8">
            <NavLinks />
          </div>
        </div>
        <PlanFooter />
      </aside>

      {/* Drawer — same nav, below lg */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="bg-navy/40 absolute inset-0 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-white p-5 shadow-lift">
            <div>
              <div className="flex items-center justify-between">
                <Wordmark className="text-[1.25rem]" />
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="text-slate hover:text-navy rounded-full p-1.5"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-8">
                <NavLinks onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
            <PlanFooter />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-cloud/85 sticky top-0 z-40 border-b backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="text-slate hover:text-navy border-line rounded-input border bg-white p-2 lg:hidden"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              {!loading && <SiteSwitcher />}
            </div>

            <div className="flex items-center gap-3">{!loading && <AccountMenu />}</div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto max-w-5xl">
            {loading ? (
              <ShellSkeleton />
            ) : (
              <>
                <WindowNotice />
                {children}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Shown for the frame between mount and the store resolving. Mirrors the
 * rhythm of a real page (title, subtitle, two panels) so the swap doesn't
 * visibly jump.
 */
function ShellSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="bg-line h-8 w-56 rounded-lg" />
      <div className="bg-line/70 mt-3 h-4 w-80 rounded" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="border-line h-44 rounded-xl border bg-white" />
        <div className="border-line h-44 rounded-xl border bg-white" />
      </div>
    </div>
  );
}
