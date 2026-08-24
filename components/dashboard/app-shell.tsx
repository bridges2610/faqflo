'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { useDashboard } from '@/lib/dashboard/provider';
import { isPro, nextCheckDate, PRO_PRICE } from '@/lib/dashboard/plans';
import { AeoIcon, ChartIcon, DocIcon, FaqIcon, HomeIcon, SearchIcon } from './nav-icons';
import { AccountMenu } from './account-menu';
import { RunNotice } from './run-notice';
import { ScanNotice } from './scan-notice';
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

  ⚠️ NO ROUTE MOVED, AND ONE GAINED A CHILD. Audit actions deep-link to
  /dashboard/faqs/<groupId> — a real route now; it used to be an anchor
  `#<groupId>` that nothing on the Answers screen ever rendered, so the link
  silently landed at the top of a list. Also
  /dashboard/publish and /dashboard/questions; the group page links to
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
 * When the next automatic check lands, on every page rather than only Results.
 *
 * ⚠️ THIS REPLACED A COUNTDOWN, AND IT IS A DIFFERENT KIND OF MESSAGE. The old
 * WindowNotice counted down the last seven days of a Get Cited window and then
 * explained why things had stopped — a deadline that is only visible on the
 * screen it will break is a deadline you meet by accident. A subscription has no
 * such deadline. What is worth surfacing instead is the opposite fact: something
 * is going to happen for you, without you doing anything.
 *
 * Quiet by design — it is reassurance, not a warning, so it gets the neutral
 * treatment the ended-window notice used rather than the accent one.
 */
function NextCheckNotice() {
  const { site, user } = useDashboard();

  // Free gets one check, taken at signup. There is no next one to promise.
  if (!site || !isPro(user)) return null;

  const due = nextCheckDate(site);
  if (!due) return null;

  /*
    Due already, or overdue: the sweep runs nightly, so "today" is honest and a
    date in the past is not. Saying a check was due yesterday invites the
    question of where it is, and the answer — "tonight" — is the useful half.
  */
  const today = due.getTime() <= Date.now();

  return (
    <div className="border-line bg-cloud mb-6 rounded-xl border p-4">
      <p className="text-navy text-sm font-semibold">
        {today
          ? `Next check for ${site.name} runs tonight`
          : `Next check for ${site.name}: ${due.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}`}
      </p>
      <p className="text-slate mt-1 text-sm leading-relaxed">
        We ask the AI engines about you every week and record what they say.{' '}
        <Link href="/dashboard/tracking" className="text-primary hover:text-primary-hover font-semibold">
          See your results →
        </Link>
      </p>
    </div>
  );
}

/**
 * What plan this account is on, pinned to the bottom of the sidebar.
 *
 * ⚠️ NO MORE "N of M sites set up". That line counted per-site purchases, which
 * was the only honest summary when the money was per site and an account could
 * hold a mix of paid and unpaid ones. One account is on one plan now, so the
 * count would always read "1 of 1" or "0 of 1" and teach nothing.
 */
function PlanFooter() {
  const { user, tracking } = useDashboard();
  const pro = isPro(user);

  /*
    ⚠️ "ALREADY TAKEN" IS A CLAIM ABOUT THE PAST AND HAS TO BE CHECKED.

    This line read "One check, already taken" for every free account, which is
    false for the majority of the time somebody spends on this screen: a brand
    new signup has not had their check yet, and the first thing the sidebar told
    them was that they had used up the thing they came for.

    `checksUsed` is the count the meter on Results is drawn from, so the sidebar
    and that page cannot disagree about whether a check has happened.
  */
  const spent = (tracking?.checksUsed ?? 0) > 0;

  return (
    <div className="border-line bg-cloud rounded-xl border p-4">
      <p className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Your plan</p>
      <p className="text-navy mt-1 text-sm font-semibold">{pro ? 'Pro' : 'Free'}</p>
      <p className="text-slate mt-1 text-xs leading-relaxed">
        {pro
          ? 'Checked automatically every week'
          : spent
            ? 'Your one check has run'
            : 'Includes one free check'}
      </p>
      {/* Straight to the in-app plan page, not out to /#pricing. Sending a
          signed-in customer back to the marketing site to buy means they land on
          a page written for strangers and have to find their way back in. */}
      <Link
        href="/dashboard/plan"
        className="text-primary hover:text-primary-hover mt-3 inline-block text-xs font-semibold"
      >
        {pro ? 'Manage your plan →' : `Upgrade to Pro — $${PRO_PRICE.monthly}/mo →`}
      </Link>
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
  const { loading, loadError, retryLoad } = useDashboard();
  // Data is present and usable — the only state in which the header's
  // data-reading children are safe to mount.
  const ready = !loading && !loadError;
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
              {/* ⚠️ `!loading` alone is not enough here any more. A failed load
                  stops loading without producing data, and both of these read
                  from it — AccountMenu dereferences user.name and would throw,
                  taking down the very panel that explains the failure. */}
              {ready && <SiteSwitcher />}
            </div>

            <div className="flex items-center gap-3">{ready && <AccountMenu />}</div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto max-w-5xl">
            {loadError ? (
              <LoadFailed message={loadError} onRetry={retryLoad} />
            ) : loading ? (
              <ShellSkeleton />
            ) : (
              <>
                <NextCheckNotice />
                {/* Same slot, same argument as the countdown above: a run that
                    only reports on the page that started it is one you assume
                    died when you clicked away.

                    Two notices, and their advice is deliberately contradictory:
                    tracking runs from the browser and needs the tab, the first
                    scan runs on the server and does not. See scan-notice.tsx. */}
                <ScanNotice />
                <RunNotice />
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
 * The dashboard could not be read.
 *
 * ⚠️ THE WORDING IS THE POINT, NOT THE PANEL. "Could not load" and "you have
 * nothing yet" render almost identically and mean opposite things, and only one
 * of them tempts a customer into retyping answers that are sitting safely in
 * the database. That distinction is the whole reason the store throws on a
 * failed read instead of returning an empty snapshot, and it would be undone
 * here by copy that hedged.
 *
 * So: say plainly that the data is there and we could not reach it, show what
 * the database actually said rather than a generic apology, and offer the
 * retry — a reload works too, but a button that does the same thing without
 * losing the page is kinder than making someone guess.
 */
function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="border-line rounded-card border bg-white p-6 sm:p-8">
      <h1 className="text-navy text-lg font-semibold">We couldn&rsquo;t load your dashboard</h1>
      <p className="text-slate mt-2 text-sm leading-relaxed">
        Your pages, answers and questions are saved — we just couldn&rsquo;t reach them this time.
        Nothing has been lost, so there&rsquo;s no need to write anything again.
      </p>
      <p className="text-slate mt-3 font-mono text-xs">{message}</p>
      <Button className="mt-5" size="sm" onClick={onRetry}>
        Try again
      </Button>
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
