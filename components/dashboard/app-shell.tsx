'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/ui/wordmark';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { useDashboard } from '@/lib/dashboard/provider';
import { getCitedDaysLeft, hasGetCited, hasStayCited } from '@/lib/dashboard/plans';
import { AeoIcon, ChartIcon, DocIcon, FaqIcon, HomeIcon, SearchIcon } from './nav-icons';
import { AccountMenu } from './account-menu';
import { SiteSwitcher } from './site-switcher';

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

/*
  Five destinations, named after what the customer wants rather than which
  stage of our pipeline produces it.

  This used to be eight, one per step of the loop — audit, discover, generate,
  publish, track, plus sites — on the reasoning that the sidebar teaches the
  product. It does, but it teaches OUR shape, and the person reading it runs a
  roofing company. Eight destinations is also eight places to check, most of
  which are empty most of the time.

  What merged, and why the pairs are pairs rather than one screen each:

    Answers       = /faqs + /publish     writing them, then getting them onto
                                         the page. Same object, two verbs.
    Opportunities = /questions + /content what you haven't answered, and what
                                         you haven't written. Both are gaps.

  ⚠️ NO ROUTE MOVED. Audit actions deep-link to /dashboard/faqs#<groupId>,
  /dashboard/publish and /dashboard/questions; GroupCard links to
  /dashboard/publish#<groupId>; checkout returns to /dashboard/audit and
  /dashboard/tracking with a ?purchased flag. The absorbed routes keep their
  URLs and gain a WorkspaceTabs strip, so every one of those still lands.

  Sites left the sidebar for the account menu. It is where you go once, when you
  add a site — not a place to check.
*/
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/dashboard/audit', label: 'Your site', Icon: AeoIcon },
  { href: '/dashboard/faqs', label: 'Answers', Icon: FaqIcon },
  { href: '/dashboard/questions', label: 'Opportunities', Icon: SearchIcon },
  { href: '/dashboard/tracking', label: 'Results', Icon: ChartIcon },
];

/*
  Which nav item owns which routes.

  Prefix matching alone no longer works: /dashboard/publish belongs to Answers
  and /dashboard/content belongs to Opportunities, and neither shares a prefix
  with the item that owns it. Without this the tab strip would highlight a
  section while the sidebar highlighted nothing.
*/
const OWNS: Record<string, string[]> = {
  '/dashboard/faqs': ['/dashboard/publish'],
  '/dashboard/questions': ['/dashboard/content'],
};

/** Home owns the exact path; the rest own their subtree, plus anything above. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  if (pathname.startsWith(href)) return true;
  return (OWNS[href] ?? []).some((owned) => pathname.startsWith(owned));
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
        {tracking ? 'Stay Cited is active' : 'No subscription'}
      </p>
      {!tracking && (
        /* Straight to checkout, not out to /#pricing. Sending a signed-in
           customer back to the marketing site to buy means they land on a page
           written for strangers and have to find their way back in. */
        <Link
          href="/dashboard/checkout/start"
          className="text-primary hover:text-primary-hover mt-3 inline-block text-xs font-semibold"
        >
          Add Stay Cited →
        </Link>
      )}
    </div>
  );
}

/**
 * Help, kept out of NAV on purpose.
 *
 * The five above are places you go to do work; this is a reference you open
 * when something isn't behaving. Adding it as a sixth would undo the 8→5
 * pruning argued for at the top of this file — the sidebar would be teaching
 * our shape again. So it sits down here with the account card, always
 * reachable, never competing with the task list.
 *
 * ⚠️ Rendered in TWO places — the permanent sidebar and the mobile drawer, both
 * below. They are separate JSX, not one shared block, so anything added to one
 * has to be added to the other.
 */
function HelpLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard/help"
      onClick={onNavigate}
      className="text-slate hover:text-navy hover:bg-cloud mb-2 flex items-center gap-3 rounded-input px-3 py-2 text-sm transition-colors duration-150"
    >
      <DocIcon className="h-4 w-4 shrink-0" />
      Help
    </Link>
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
      {/*
        Sidebar — permanent from lg up, and pinned to the viewport.

        ⚠️ `h-dvh` is what keeps the Help link and the account card on screen,
        and it is easy to mistake for decoration. Without an explicit height the
        aside is a flex child with the default `align-self: stretch`, so it grows
        to the height of the DOCUMENT rather than the viewport — and
        `justify-between` then dutifully pushes the footer to the bottom of a
        4,000px page, where nobody scrolls to find it. An explicit height opts it
        out of stretching, because stretch only sizes an item whose cross-size is
        `auto`.

        `sticky top-0` then holds it there. That relies on no ancestor setting
        `overflow`: today <body> is `flex min-h-dvh flex-col`, DashboardProvider
        renders no DOM node at all, and globals.css sets no overflow rule. An
        `overflow-x-hidden` added to <body> later would break this silently, with
        the sidebar quietly scrolling away again.

        `overflow-y-auto` is for viewports under ~500px, where the nav plus the
        footer no longer fit. Sticky and overflow on the SAME element is fine —
        only an ancestor with overflow breaks stickiness.
      */}
      <aside className="border-line sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between overflow-y-auto border-r bg-white p-5 lg:flex">
        <div>
          <Wordmark className="text-[1.25rem]" />
          <div className="mt-8">
            <NavLinks />
          </div>
        </div>
        <div>
          <HelpLink />
          <PlanFooter />
        </div>
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
            <div>
              <HelpLink onNavigate={() => setDrawerOpen(false)} />
              <PlanFooter />
            </div>
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
