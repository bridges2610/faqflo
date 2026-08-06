'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/ui/wordmark';
import { useDashboard } from '@/lib/dashboard/provider';
import { PLAN_LIMITS } from '@/lib/dashboard/plans';
import {
  AeoIcon,
  ChartIcon,
  CloseIcon,
  FaqIcon,
  HomeIcon,
  MenuIcon,
  SetupIcon,
} from './nav-icons';
import { PlanSwitcher } from './plan-badge';
import { SiteSwitcher } from './site-switcher';

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', Icon: HomeIcon },
  { href: '/dashboard/faqs', label: 'FAQs', Icon: FaqIcon },
  { href: '/dashboard/setup', label: 'Setup', Icon: SetupIcon },
  { href: '/dashboard/aeo', label: 'AEO', Icon: AeoIcon },
  { href: '/dashboard/analytics', label: 'Analytics', Icon: ChartIcon },
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

/** Plan summary + upgrade path, pinned to the bottom of the sidebar. */
function PlanFooter() {
  const { plan, limits, sites } = useDashboard();

  return (
    <div className="border-line bg-cloud rounded-xl border p-4">
      <p className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Your plan</p>
      <p className="text-navy mt-1 font-semibold">{limits.label}</p>
      <p className="text-slate mt-1 text-xs leading-relaxed">
        {sites.length} of {limits.sites} {limits.sites === 1 ? 'site' : 'sites'} used
      </p>
      {plan === 'pro' && (
        <Link
          href="/#pricing"
          className="text-primary hover:text-primary-hover mt-3 inline-block text-xs font-semibold"
        >
          Upgrade to {PLAN_LIMITS.business.label} →
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

            <div className="flex items-center gap-3">
              <PlanSwitcher />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto max-w-5xl">{loading ? <ShellSkeleton /> : children}</div>
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
