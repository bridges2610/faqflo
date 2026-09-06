'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { useDashboard } from '@/lib/dashboard/provider';
import { formatShortDate } from '@/lib/dashboard/format';
import { isPro, nextCheckDate, PRO_PRICE } from '@/lib/dashboard/plans';
import type { PlanId } from '@/lib/dashboard/types';
import { AeoIcon, ChartIcon, DocIcon, FaqIcon, HomeIcon, SearchIcon } from './nav-icons';
import { AccountMenu } from './account-menu';
import { AuditNotice } from './audit-notice';
import { HelpBubble } from './help-bubble';
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

  What merged, and why:

    Answers  = /faqs + /publish + /questions + /content
               One page. The questions nobody has answered sit at the top as
               suggestions, the answers you have written sit below them, and
               the paste block is a panel off the bottom bar. Writing an answer
               and putting it on your website is one job, and the gap you are
               filling belongs on the same screen as the filling.

  ⚠️ TWO ITEMS ARE NAMED FOR WHAT THEY ANSWER, NOT FOR THE DATA BEHIND THEM.
  "Results" and "Your site" are our words for our pipeline. "AI Mentions" is
  the thing a business owner came to find out — does AI say my name — and
  "Audit" is what they would call a report on their website. Competitors is new
  and is the question they ask second: who is it naming instead.

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
  { href: '/dashboard/audit', label: 'Audit', Icon: AeoIcon },
  /* ⚠️ "Content", NOT "Answers", AND THE PATH DELIBERATELY DID NOT MOVE.
     The screen makes articles, FAQs and the paste code; "Answers" named a
     third of it. Renaming the label rather than the route is what keeps every
     link in worklist.ts, audit-context.ts and the two redirect stubs true —
     see the note on NAV below about labels changing and URLs not. */
  { href: '/dashboard/faqs', label: 'Content', Icon: FaqIcon },
  { href: '/dashboard/competitors', label: 'Competitors', Icon: SearchIcon },
  { href: '/dashboard/tracking', label: 'AI Mentions', Icon: ChartIcon },
];

/*
  Which nav item owns which routes.

  Prefix matching alone no longer works: /dashboard/publish belongs to Answers
  and /dashboard/content belongs to Opportunities, and neither shares a prefix
  with the item that owns it. Without this the tab strip would highlight a
  section while the sidebar highlighted nothing.
*/
const OWNS: Record<string, string[]> = {
  /* Answers absorbed three routes, not one. Publish is its copy panel now, and
     Opportunities — the questions nobody has answered yet — became the list of
     suggestions at the top of it. All three URLs still resolve; see the note on
     NAV above. */
  '/dashboard/faqs': ['/dashboard/publish', '/dashboard/questions', '/dashboard/content'],
};

/** Home owns the exact path; the rest own their subtree, plus anything above. */
/**
 * Routes that drop the 64rem reading measure and use the whole window.
 *
 * ⚠️ max-w-5xl IS THE DEFAULT FOR A REASON — it is a reading measure. Every
 * screen here is mostly prose and cards of prose, and a paragraph run to 1900px
 * on a wide monitor is genuinely harder to read than the same paragraph at
 * 1024. So this is an opt-in list of the screens that are a WIDE GRID rather
 * than a column of text, not a setting anyone should flip on by default.
 *
 * Results qualifies: its evidence section is a matrix of prompts against every
 * engine, and the extra width is what stops that table needing a scroll box.
 * Matched exactly, so /dashboard/tracking widens and any child route does not
 * inherit it by accident.
 */
const WIDE = new Set(['/dashboard/tracking']);

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  if (pathname.startsWith(href)) return true;
  return (OWNS[href] ?? []).some((owned) => pathname.startsWith(owned));
}

/*
  What a free account sees, which is now everything Pro does.

  ⚠️ IT USED TO BE ONE ITEM, AND THE OTHER HALF WAS A REDIRECT. Eight routes
  called requirePro() and bounced a free account back to /dashboard; this list
  held a single link so the nav did not advertise doors that were locked. The
  note here said "both halves are needed, and if one is changed the other has to
  move with it" — so they moved together: lib/auth/pro-only.ts is gone and every
  screen is reachable.

  The reasoning that file carried is worth keeping even though the guard is not.
  A per-route check was the only workable shape: proxy.ts must not do database
  work (its own header records the ERR_TOO_MANY_REDIRECTS incident that followed
  when it and the DAL disagreed, and `plan` lives on the profiles row rather
  than the JWT), and a server layout is never given the pathname, so it could
  not let /dashboard through while redirecting its siblings. Anything Pro-only
  in future needs that same per-route shape rather than either alternative.

  ⚠️ THE LOCKS MOVED INTO THE SCREENS, THEY DID NOT DISAPPEAR. Every Pro action
  behind these links still refuses a free account — server-side, in
  lib/auth/entitlements.ts, which is the only gate that counts. What changed is
  that a free account can now SEE what it is being refused and what it costs,
  which is the rule the rest of the product already follows: LOCKED IS NOT
  DISABLED.

  ⚠️ Home keeps a different label. app/(app)/dashboard/page.tsx still renders
  FreeHome for a free account — a conversion page, not a gated OverviewWorkspace
  — and "Your report" names what is actually there.
*/
const FREE_NAV: NavItem[] = NAV.map((item) =>
  /* ⚠️ THE LABEL MOVED OFF Home AND ONTO Audit, BECAUSE THE SCREENS DID. Home
     is the real dashboard for both plans now. /dashboard/audit is where a free
     account's report lives — the two had grown to say nearly the same thing, so
     that route renders FreeHome for free and the audit for Pro. Same slot, same
     icon, the name each plan's screen actually deserves. */
  item.href === '/dashboard/audit' ? { ...item, label: 'Your report' } : item,
);

/**
 * The spinner on a nav link that has been clicked but not yet arrived.
 *
 * ⚠️ WHY THIS EXISTS AT ALL, GIVEN app/(app)/loading.tsx ALREADY DRAWS A
 * SKELETON. That file only paints once the navigation COMMITS. Every route under
 * this shell is dynamic — the (app) layout is force-dynamic and awaits
 * requireUser() + sitesForUser() — so between the click and the server answering
 * there is a real pause in which nothing on screen changes at all. This covers
 * that gap; the skeleton covers the one after it.
 *
 * ⚠️ IT MUST BE A DESCENDANT OF THE <Link>, NOT A SIBLING. useLinkStatus reports
 * on the Link it is rendered inside; hoisting this into NavLinks and passing
 * `pending` down would return false forever, silently.
 *
 * ⚠️ ALWAYS RENDERED AT A FIXED SIZE, WITH ONLY OPACITY CHANGING. The hook's own
 * docs warn that "inline indicators can easily introduce layout shifts" and
 * recommend exactly this. Mounting the spinner on click would widen the row by
 * 14px plus a gap at the moment the pointer is on it.
 *
 * ⚠️ aria-hidden, AND THAT IS NOT AN OVERSIGHT. app/(app)/loading.tsx carries
 * role="status" with "Loading your dashboard" a beat later. Two announcements
 * for one navigation is noise, and this one is the less informative of the two.
 *
 * ⚠️ NO prefetch={false} ON THE LINKS. The docs suggest it to make the pending
 * state fire more often, which would be optimising the wait rather than the
 * navigation — deliberately slowing arrival to show a nicer spinner. Where a
 * prefetch has already landed and this never appears, that is the good outcome.
 */
function NavPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`ml-auto h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent transition-opacity duration-150 ${
        pending ? 'animate-spin opacity-60' : 'opacity-0'
      }`}
    />
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useDashboard();

  /*
    ⚠️ isPro(null) is false, so the first frame shows the free nav.

    That used to matter a great deal — a free account briefly seeing five links
    it could not use was worse than a Pro account briefly seeing one. Both lists
    now hold the same destinations, so the only thing that flips a frame late is
    Home's label. Left as it is rather than collapsed: the page composition is
    still chosen server-side for the same reason (see
    app/(app)/dashboard/page.tsx), and the day anything is Pro-only again this
    is where it belongs.
  */
  const items = isPro(user) ? NAV : FREE_NAV;

  return (
    <>
      <nav className="flex flex-col gap-1.5">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-input px-3 py-2.5 text-sm transition-colors duration-150 ${
                active
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-slate hover:text-navy hover:bg-cloud'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
              <NavPending />
            </Link>
          );
        })}
      </nav>

      {/*
        ⚠️ A "What Pro unlocks" BLOCK USED TO SIT HERE, AND IT WENT WHEN THE
        LINKS ABOVE STARTED WORKING.

        It listed the same four destinations a second time, each as a padlocked
        row pointing at /dashboard/plan and labelled "… is part of Pro". That
        was right while a free account had exactly one real destination and the
        other four redirected. Now every one of them opens, so the block would
        have shown each screen twice — once as somewhere to go, once as
        somewhere it cannot — and its label would be false: the screens are not
        part of Pro, the actions inside them are.

        ⚠️ WHERE THE UPSELL WENT, RATHER THAN VANISHING. Into the screens
        themselves, next to the thing being withheld: the generator says
        "Writing needs Pro", competitors states what Pro measures, and
        content-workspace still renders an UpgradeCard. That is the rule this
        block's own note quoted — LOCKED IS NOT DISABLED — applied one level
        down, where the reader is actually looking at the feature.

        Worth keeping from it if anything like it returns: the padlocks belong
        on the container OR the rows and never both, and it must render outside
        <nav> so a screen reader's navigation landmark does not list places the
        account cannot go.
      */}
    </>
  );
}

/*
  NextCheckNotice used to live here: a bordered card above every Pro page saying
  when the next automatic check lands.

  ⚠️ IT WAS MOSTLY A DUPLICATE OF THE SIDEBAR. PlanFooter below already told
  every Pro account "Checked automatically every week", which was the card's
  whole second sentence — so it spent about 84px of the content column, on every
  screen, to add one fact: the date. That fact moved into PlanFooter's own line,
  and the box went.

  Its "See your results →" link was dropped rather than moved. A CTA inside the
  plan block would rebuild the clutter this removed, and AI Mentions is a nav
  item a few pixels above it in the same column.
*/

/**
 * What plan this account is on, pinned to the bottom of the sidebar.
 *
 * ⚠️ NO MORE "N of M sites set up". That line counted per-site purchases, which
 * was the only honest summary when the money was per site and an account could
 * hold a mix of paid and unpaid ones. One account is on one plan now, so the
 * count would always read "1 of 1" or "0 of 1" and teach nothing.
 */
function PlanFooter() {
  /* No `tracking` any more — the free allowance line that read it has gone. See
     the note beside the Pro-only paragraph below. */
  const { user, site } = useDashboard();
  const pro = isPro(user);

  /*
    When the next automatic check lands — the one fact the banner above the page
    used to carry, now folded into the line that already promised weekly checks.

    ⚠️ THE FALLBACK IS THE ORIGINAL SENTENCE, NOT A BLANK. A Pro site with no
    nextCheckAt yet still gets told checks run weekly; dropping the reassurance
    for accounts without a date would be a worse regression than the space this
    reclaimed.

    Due already, or overdue: the sweep runs nightly, so "tonight" is honest and
    a date in the past is not. Saying a check was due yesterday invites the
    question of where it is, and the answer is tonight.
  */
  const due = pro ? nextCheckDate(site) : null;
  const proLine = !due
    ? 'Checked automatically every week'
    : due.getTime() <= Date.now()
      ? 'Checked every week — next one tonight'
      : `Checked every week — next one ${formatShortDate(due)}`;

  /*
    ⚠️ NO FILL, AND IT HAD ONE. This was `bg-cloud`, from when the sidebar was
    white and a tint was how a box announced itself. Against `bg-shell` that
    fill is very nearly the surface it sits on, and the border alone says
    everything the box needs to say.

    ⚠️ IT IS NOW THE ONLY BORDERED THING IN THE SIDEBAR, which is deliberate and
    is why the Pro block above it has no border. Two outlined boxes in a 256px
    column read as a pair of equals; only one of these is a place the customer's
    own state lives. The advert is grouped by its copy instead.
  */
  return (
    <div className="border-line rounded-xl border p-4">
      <p className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Your plan</p>
      <p className="text-navy mt-1 text-sm font-semibold">{pro ? 'Pro' : 'Free'}</p>
      {/*
        ⚠️ PRO ONLY, AND THE FREE HALF WAS REMOVED RATHER THAN REWORDED.

        This used to read "2 of 3 checks left" to a free account, which was
        arithmetically true and still confusing — and the reason is visible the
        moment both places that say it are put side by side.

        prompt-ranking.tsx states the same allowance on the free report, beside
        the button that spends it: "2 checks left. Fix something first — that's
        what makes the answer change", or "Checked today. You can run it again
        tomorrow", or the spent-state copy about what Pro adds. Here the same
        number arrived with none of that — no button, no explanation of what a
        "check" is, nothing about how one gets spent — just a count under the
        word "Free". A duplicate stripped of the context that made it mean
        something reads as a puzzle.

        So the allowance is now stated in exactly one place, which is the one
        that can act on it. ⚠️ That makes prompt-ranking.tsx the only surface
        carrying it: if that copy ever goes, free accounts lose all sight of
        the re-check budget rather than merely one of two mentions.

        Pro's line stays. It is not duplicated anywhere, and "next one 12 Sep"
        is the thing the subscription actually buys.
      */}
      {pro ? <p className="text-slate mt-1 text-xs leading-relaxed">{proLine}</p> : null}
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
      className="text-slate hover:text-navy hover:bg-cloud mb-2 flex items-center gap-3 rounded-input px-3 py-2.5 text-sm transition-colors duration-150"
    >
      <DocIcon className="h-4 w-4 shrink-0" />
      Help
      <NavPending />
    </Link>
  );
}

export function AppShell({
  children,
  plan,
  summariesLeft,
  userId,
}: {
  children: React.ReactNode;
  /* ⚠️ THE PLAN ARRIVES AS A PROP FROM THE LAYOUT, WHICH HAS ALREADY AWAITED
     THE PROFILE ROW. useDashboard()'s user is null on the first frame, so
     anything branching on it flashes the free state at a paying customer —
     the trap app/(app)/dashboard/page.tsx documents. Only HelpBubble needs it
     so far; the nav below still branches on the loaded user because its two
     versions differ by a label rather than by an entitlement. */
  plan: PlanId;
  summariesLeft: number | null;
  /* Scopes the help button's "hide until next sign-in" to this account. */
  userId: string;
}) {
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
      {/*
        ⚠️ bg-shell, AND EVERY HOVER IN THIS FILE DEPENDS ON IT. See the token's
        own note in globals.css: it sits between white and cloud, which leaves
        too little room for a white hover, so every row in this sidebar hovers
        DARKER, to cloud. Changing this surface means re-picking those.

        It was briefly `bg-cloud`, which is also what <body> paints — so on Pro
        screens the sidebar and the content beside it were one flat surface with
        only `border-r` between them. Shell is lighter than the content on Pro
        and greyer than the content on the free report, which paints its own
        white backdrop. It is the only value that separates from both.
      */}
      <aside className="border-line sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between overflow-y-auto border-r bg-shell p-5 lg:flex">
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
            className="bg-ink/40 absolute inset-0 backdrop-blur-[2px]"
          />
          {/* Cloud, to match the permanent sidebar — it is the same nav, and
              the hovers inside it are written for a cloud surface. */}
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-shell p-5 shadow-lift">
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
        {/* ⚠️ print:hidden EXPLICITLY, BECAUSE THE BLANKET RULE THAT COVERED
            THIS IS GONE. globals.css used to hide every <header> when printing;
            it caught the free report's own masthead too and deleted the title
            block from every printed copy. The rule is scoped to real chrome
            now, which means chrome has to say so itself. */}
        <header className="border-line bg-cloud/85 sticky top-0 z-40 border-b backdrop-blur-md print:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="text-slate hover:text-navy border-line rounded-input border bg-surface p-2 lg:hidden"
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

        {/* ⚠️ THE SIDE PADDING GREW WITH THE WIDE ROUTES. At max-w-5xl the
            content was centred with slack either side, so px-6 was plenty. A
            full-width page has no slack — its cards run to whatever the window
            is — and 24px of air between a card edge and the browser edge reads
            as broken rather than roomy. lg:px-10 is for the widths where that
            actually bites. */}
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 lg:px-16">
          <div className={`mx-auto ${WIDE.has(pathname) ? '' : 'max-w-5xl'}`}>
            {loadError ? (
              <LoadFailed message={loadError} onRetry={retryLoad} />
            ) : loading ? (
              <ShellSkeleton />
            ) : (
              <>
                {/* ⚠️ Both notices are about what the app is doing right now —
                    a scan queued, a run in flight. Neither is true of a sheet of
                    paper, and they sit above the report so they would print as a
                    preamble to it. */}
                <div className="print:hidden">
                {/* A run that
                    only reports on the page that started it is one you assume
                    died when you clicked away.

                    Two notices, and their advice is deliberately contradictory:
                    tracking runs from the browser and needs the tab, the first
                    scan runs on the server and does not. See scan-notice.tsx. */}
                  <ScanNotice />
                  <RunNotice />
                </div>
                {children}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ⚠️ OUTSIDE <main>, AND THAT IS WHAT MAKES IT A TOAST. Inside, the
          content column's padding and stacking context would box it in; out
          here it is positioned against the viewport. Rendered by the shell
          rather than by a page, so it follows across navigations. */}
      <AuditNotice />

      {/* Same reasoning as the toast above: mounted by the shell so it follows
          across navigations, and outside <main> so it is positioned against the
          viewport rather than boxed in by the content column. */}
      <HelpBubble plan={plan} summariesLeft={summariesLeft} userId={userId} />
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
  /*
    rounded-xl, not `rounded-card`. That was a typo for a token which has never
    existed — globals.css defines input/lg/xl/2xl/pill and no `card` — so
    Tailwind emitted nothing for it and this panel rendered with square corners
    while every other card on the screen was rounded. rounded-xl is the radius
    Card itself uses.
  */
  return (
    <div role="alert" className="border-line rounded-xl border bg-surface p-6 sm:p-8">
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
        <div className="border-line h-44 rounded-xl border bg-surface" />
        <div className="border-line h-44 rounded-xl border bg-surface" />
      </div>
    </div>
  );
}
