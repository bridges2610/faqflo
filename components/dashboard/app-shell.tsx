'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { useDashboard } from '@/lib/dashboard/provider';
import { isPro, nextCheckDate, PRO_PRICE, runsLeftFor, TRACKING_PLANS } from '@/lib/dashboard/plans';
import { AeoIcon, ChartIcon, DocIcon, FaqIcon, HomeIcon, LockIcon, SearchIcon } from './nav-icons';
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

/*
  What a free account can actually go to.

  ⚠️ ONE ITEM, AND THE REST ARE NOT MERELY HIDDEN — each gated route redirects
  a free account back to /dashboard in its own page.tsx. Hiding a link that
  still works would leave the nav lying about what exists; redirecting without
  hiding would leave five links that all go to the same place. Both halves are
  needed, and if one is changed the other has to move with it.

  The free plan's whole product is a single report: one audit of one page, and
  three prompts put to the engines that the reader can re-run as they fix
  things. All of it lives on /dashboard. There is no second screen to navigate
  to.

  ⚠️ Home's label changes with it. "Home" implies somewhere else to go back
  from, which is true on Pro's five-item nav and false here.
*/
const FREE_NAV: NavItem[] = [{ href: '/dashboard', label: 'Your report', Icon: HomeIcon }];

/*
  What each locked row is actually worth, in the reader's terms.

  ⚠️ THE LABELS ALONE DO NOT SELL ANYTHING. "Opportunities" means nothing to a
  plumber, and neither does "Your site" — they are names for screens, chosen for
  a Pro account that has already paid and needs to find things. A free account
  has not paid and is not navigating; it is deciding. So each row gets a second
  line that says what the screen DOES, and that second line is the reason this
  block earns space in a 256px column instead of being four dead menu items.

  ⚠️ NO NUMBERS HERE, DELIBERATELY, AND THE FIRST DRAFT HAD THEM. "All 44
  checks" and "the 4 you're missing" were both considered and both rejected.
  44 is a real count — it is exactly how many findings the four check modules
  emit — but the report itself says "Based on N checks" where N is the SCORED
  count, which can never reach 44 (coverage is always unscored) and lands
  somewhere in the thirties. Two true numbers that disagree on screen read as
  one wrong number. It also derives from no constant, so adding a check would
  silently make this copy stale; help-workspace.tsx:52 declines to repeat the
  figure for that exact reason and this is not the place to overrule it.

  The "4 you're missing" was worse: it looks like it ties to the report's "the
  other 4 went to somebody else", but that 4 is questions no engine named you
  on — a tracking result — while Opportunities holds discovered questions you
  have not answered. They would match only by coincidence.

  General copy has neither failure mode, needs nothing from useDashboard(), and
  cannot flash a zero while the provider resolves.

  ⚠️ ≤30 CHARACTERS EACH, AND THAT IS MEASURED, NOT A STYLE PREFERENCE. The
  aside is w-64 (256px); minus its p-5 (40) and the row's px-3 (24) leaves
  192px, and minus the icon and gap leaves ~160px — about 30 characters at
  11px. Longer copy wraps to a third line and the row stops reading as one
  thing. The budget was ~26 while these sat in a padded box; losing the box and
  dropping to 11px bought the rest. Re-measure before writing longer copy —
  every string here is well inside the limit and none of them should crowd it.
*/
const PRO_VALUE: Record<string, string> = {
  '/dashboard/audit': 'Every page, not just one',
  '/dashboard/faqs': 'Written and ready to paste',
  '/dashboard/questions': 'Questions you’re missing',
  '/dashboard/tracking': 'Re-checked every week',
};

/*
  What Pro adds, shown to a free account underneath its one real destination.

  ⚠️ THE NOTE ABOVE REJECTED TWO OPTIONS AND THIS IS A THIRD. It weighed hiding
  the links against leaving them working, and ruled out "redirecting without
  hiding" because that leaves five links that all go to the same place. That is
  still true and still bad — when the links look like navigation. These do not.

  ⚠️ WHAT MAKES ONE SHARED DESTINATION LEGIBLE IS THE CONTAINER, AND IT USED TO
  BE FOUR PADLOCKS. The earlier version put a lock on every row under a mono
  "WITH PRO" label, on the reasoning that a padlock per row is what stops these
  reading as four ways to four screens. It stopped them reading as navigation
  and started them reading as four denials — the same refusal, refused four
  times. The tint now does the grouping, one padlock on the header does the
  gating, and the value lines describe rather than point. Do not put the
  per-row padlocks back without also removing the container; they were two
  answers to one question and having both is what made it feel like a wall.

  ⚠️ IT IS AN ADVERT, NOT NAVIGATION, and the distinction is what keeps the 8→5
  pruning argument at the top of this file intact. A free account's real
  destination count is still one. Nothing here is a place to check; it is a
  description of the plan they are not on, placed where the question "what else
  is there?" actually occurs to somebody. It renders OUTSIDE the <nav> for that
  reason — inside, a screen reader's navigation landmark would list five
  destinations for an account that has one.

  ⚠️ DERIVED FROM NAV, NEVER RETYPED. A second literal list would drift from
  the first the moment a destination is renamed, and the drift would be
  invisible — an advert promising a screen that no longer exists by that name.
  Only the value line is looked up, and a renamed route loses its line rather
  than keeping a stale one.

  ⚠️ LOCKED IS NOT DISABLED. These are ordinary full-opacity links; the tint,
  the header lock and the heading do the work. copy-html-button.tsx settled this
  for its own padlock, and prompt-ranking.tsx states the rule: "a greyed-out
  control with a tooltip makes the reader hunt for why". They also genuinely go
  somewhere, which is what account-menu.tsx's note about "a menu item that
  closes the menu and goes nowhere" requires of anything Pro-shaped in a nav.

  ⚠️ THE PATTERN WAS ALREADY WRITTEN AND NEVER RAN. worklist.ts has a
  `locked: 'pro'` task type and task-row.tsx has the styling for it, but
  buildWorklist's only consumer is Pro's Home, so the free branch is dead code.
  This is the first live use; it follows those conventions rather than inventing
  new ones, and if that branch ever wakes up the two should still agree.
*/
const PRO_TEASE = NAV.filter((item) => item.href !== '/dashboard').map((item) => ({
  ...item,
  value: PRO_VALUE[item.href],
}));

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useDashboard();

  /*
    ⚠️ isPro(null) is false, so the first frame shows the free nav.

    That is the right way round: the provider resolves `user` a frame late, and
    a free account briefly seeing five links it cannot use is worse than a Pro
    account briefly seeing one. The page composition itself is chosen
    server-side for exactly this reason — see app/(app)/dashboard/page.tsx —
    but the sidebar is client-rendered and has no server equivalent.
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
            </Link>
          );
        })}
      </nav>

      {/*
        ⚠️ `user &&`, NOT JUST `!isPro(user)`. The note above records that
        isPro(null) is false, so the first frame renders the free nav — and
        without this a PAYING customer would flash an upgrade panel before the
        provider resolved and swapped it out. Waiting for a resolved user means
        the null frame shows one item and nothing else, which is the same thing
        it showed before this group existed.

        ⚠️ NO isActive AND NO aria-current. Every row here points at
        /dashboard/plan, so isActive() would light up all four the moment
        somebody is on the plan page. None of them is ever "current".

        ⚠️ THE aria-label CARRIES THE MEANING, AND IT MATTERS MORE NOW THAN IT
        DID. LockIcon inherits aria-hidden from nav-icons' shared BASE, so the
        padlock says nothing to a screen reader — and with one lock on the
        header instead of four on the rows, this label is the ONLY per-row
        signal that a row is gated. Same reason copy-html-button.tsx spells out
        "needs Pro" in its own label. "part of Pro" is the phrase five API
        routes already use.

        ⚠️ NOT <MicroLabel>, AND THAT IS THE POINT OF THE HEADING. MicroLabel is
        mono/uppercase/slate by definition, which is exactly the treatment this
        replaced: mono uppercase reads as a field label, and this is a promise.
        Do not "restore consistency" by swapping it back.

        ⚠️ NO CONTAINER AT ALL — NO FILL AND NO BORDER — AND IT HAS HAD BOTH.
        It was a cloud fill when the sidebar was white, then an outline when the
        sidebar went grey. What groups these rows now is the heading, the value
        lines and the gap above: four rows that each say what they do are not
        mistakable for four broken menu items, which is the only thing a box was
        ever protecting against. The chrome was scaffolding for copy that had
        not been written yet. Do not re-add a box without first checking whether
        the copy still does the job.

        ⚠️ THE ROWS SHARE THE NAV'S INDENT NOW, and that is safe only because
        this is the free sidebar. px-3 aligns them under the one real
        destination above, which on a Pro nav would be five real links and a
        genuine ambiguity. There is exactly one link above them, it is styled
        active, and every row here carries a second line no nav row has.
      */}
      {user && !isPro(user) && (
        <div className="mt-7">
          <div className="mb-2 flex items-center gap-2 px-3">
            <LockIcon className="text-slate h-3.5 w-3.5 shrink-0" />
            <p className="text-navy text-sm font-semibold">What Pro unlocks</p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {PRO_TEASE.map(({ href, label, Icon, value }) => (
              <li key={href}>
                <Link
                  href="/dashboard/plan"
                  onClick={onNavigate}
                  aria-label={`${label} is part of Pro`}
                  className="rounded-input flex gap-3 px-3 py-2 transition-colors duration-150 hover:bg-cloud"
                >
                  <Icon className="text-slate mt-0.5 h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    {/* ⚠️ text-slate, NOT text-navy, AND THE HEADING KEEPS THE
                        NAVY. These labels were navy — darker and heavier than
                        the real destination above them whenever that one was
                        inactive, which put the advert on top of the thing the
                        customer actually came for. Slate is the same colour an
                        inactive nav row uses, so the block now reads under the
                        nav rather than over it. The heading stays navy because
                        it is what anchors the group. */}
                    <span className="text-slate block text-sm leading-snug font-medium">{label}</span>
                    {/* 11px, the smallest type in the sidebar. It is a
                        supporting line under a label, not a second label —
                        at text-xs the two lines competed and the row read as
                        two entries rather than one. Same size MicroLabel uses,
                        which is the floor this codebase already sets.

                        ⚠️ SAME SLATE AS THE LABEL, ON PURPOSE. Size and weight
                        already separate the two lines, and slate is 7.46:1
                        here. Going lighter to separate them by colour as well
                        runs out of room fast: slate/85 measures 5.07:1 on this
                        surface and slate/75 only 3.95:1, which fails AA for
                        type this small. */}
                    {value && (
                      <span className="text-slate block text-[0.6875rem] leading-snug">{value}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
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

  // Free's checks are pressed by hand on its own report, never scheduled — so
  // there is no next one to promise here. See TRACKING_PLANS.free.schedule.
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
  /*
    ⚠️ THE COUNT IS DERIVED, NOT A FLAG, and it is now a number rather than a
    yes/no. Free used to buy exactly one check, so "has it been spent" was the
    whole story. It buys three, so the honest line is how many are left — and
    runsLeftFor() reads that off the stored rows for the same reason `spent`
    did: a flag can disagree with reality, and this one is already knowable.
  */
  const left = runsLeftFor(tracking);

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
      <p className="text-slate mt-1 text-xs leading-relaxed">
        {pro
          ? 'Checked automatically every week'
          : left > 0
            ? `${left} of ${TRACKING_PLANS.free.runsPerPeriod} checks left`
            : 'You’ve used all three checks'}
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
      className="text-slate hover:text-navy hover:bg-cloud mb-2 flex items-center gap-3 rounded-input px-3 py-2.5 text-sm transition-colors duration-150"
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
            className="bg-navy/40 absolute inset-0 backdrop-blur-[2px]"
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
                {/* ⚠️ The three notices are about what the app is doing right
                    now — a run in flight, a scan queued, the next check due.
                    None of that is true of a sheet of paper, and they sit above
                    the report so they would print as a preamble to it. */}
                <div className="print:hidden">
                  <NextCheckNotice />
                {/* Same slot, same argument as the countdown above: a run that
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
    <div role="alert" className="border-line rounded-xl border bg-white p-6 sm:p-8">
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
