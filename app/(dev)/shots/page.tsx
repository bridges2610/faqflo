'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { AuditWorkspace } from '@/components/dashboard/audit-workspace';
import { GroupWorkspace } from '@/components/dashboard/group-workspace';
import { OverviewWorkspace } from '@/components/dashboard/overview-workspace';
import { TrackingWorkspace } from '@/components/dashboard/tracking-workspace';
import { DashboardProvider } from '@/lib/dashboard/provider';
import { buildSeed } from '@/lib/dashboard/seed';
import type { DashboardData, Site, SiteTracking, User } from '@/lib/dashboard/types';

/*
  The set the marketing screenshots are captured from.

  ⚠️ DEVELOPMENT ONLY. It renders four signed-in dashboard screens to somebody
  who is not signed in, which is exactly as alarming as it sounds — so read how
  it is contained before changing anything here:

    1. This component calls notFound() outside development, so the route 404s
       in any real deployment.
    2. It never touches Supabase. The data is lib/dashboard/seed.ts, the same
       fixture behind the dev-only "Fill with demo data" button, handed to
       DashboardProvider through its `preloaded` prop.
    3. That prop is itself gated on NODE_ENV in the provider, so even a leaked
       render could not use it to skip a real load.
    4. It is in its own (dev) route group with no layout, so it inherits
       nothing from (app) — including requireUser().

  ⚠️ IT IS NOT A WAY TO SEE A CUSTOMER'S DASHBOARD. There is no account here
  and no query: the fixture is a fictional roofing company, and the real gate
  (requireUser() in app/(app)/layout.tsx, plus proxy.ts) is untouched.

  WHY IT EXISTS. The homepage needed screenshots of the product, and taking
  them by hand meant signing in, clicking a button that writes fixture rows
  into the live database, and framing four captures identically by eye. This
  renders the same four screens deterministically at a fixed width with a
  stable hook per panel, so scripts/shots.mjs can regenerate every image after
  a UI change with one command.

  ⚠️ NO AppShell. The sidebar, header and account menu are illegible once a
  1200px screenshot is scaled into a homepage column, and AppShell renders its
  own skeleton off a `loading` flag — one more thing a capture could catch
  mid-frame. The workspaces read everything from context and fetch nothing at
  load time, so they render alone.
*/

/*
  A fixed identity, so the name and plan in the shots never move.

  ⚠️ ONE THING STILL IS NOT DETERMINISTIC: the Overview greets by time of day
  from a client clock (`greeting()` in overview-workspace.tsx), so regenerating
  in the afternoon turns "Good morning, Beau" into "Good afternoon, Beau" and
  that one file shows a diff. Left alone deliberately — bending a real product
  behaviour out of shape to flatter a screenshot is the wrong way round. Just
  know that a one-line change there is expected and harmless.
*/
const SHOT_USER: User = {
  id: 'shots-user',
  name: 'Beau',
  email: 'demo@faqflo.com',
  subscription: 'stay_cited',
  subscriptionSince: '2026-01-06T09:00:00.000Z',
};

const SHOT_SITE_ID = 'shots-site';

export default function Shots() {
  /*
    ⚠️ Not a redirect and not an env check at module scope — notFound() renders
    the real 404 for this route only, and being inside the component means the
    dev bundle is the only one that ever evaluates the tree below it.
  */
  if (process.env.NODE_ENV === 'production') notFound();

  /*
    ⚠️ BUILT IN AN EFFECT, NOT IN useMemo, AND THAT IS NOT A STYLE CHOICE.

    'use client' does not mean client-only — Next still server-renders this
    component. buildSeed() mints ids with crypto.randomUUID() and dates from
    Date.now(), so building it during render produces one set of values on the
    server and a different set in the browser, and React reports a hydration
    mismatch. The header of lib/dashboard/seed.ts says exactly this: the
    fixture runs on the client only, after mount.

    The first pass therefore renders nothing. That is fine and slightly
    useful — scripts/shots.mjs already waits for each panel to have real
    height before capturing, so there is no frame it could photograph early.
  */
  const [state, setState] = useState<{
    data: DashboardData;
    tracking: SiteTracking | null;
  } | null>(null);

  useEffect(() => {
    const seed = buildSeed(SHOT_SITE_ID);

    const site: Site = {
      id: SHOT_SITE_ID,
      name: 'Summit Roofing',
      domain: 'summitroofing.com',
      createdAt: '2026-01-06T09:00:00.000Z',
      // Bought, so nothing renders as a locked upsell panel.
      getCitedAt: '2026-01-06T09:00:00.000Z',
      // The workspaces read the audit off the site row, not out of the seed's
      // `audits` map — that map is the shape local storage wanted.
      lastAudit: seed.audits[SHOT_SITE_ID] ?? null,
      industry: 'Roofing contractor',
      location: 'Rockland County, NY',
      profileSource: 'schema',
      country: 'US',
    };

    const full: DashboardData = {
      user: SHOT_USER,
      sites: [site],
      groups: seed.groups,
      faqs: seed.faqs,
      questions: seed.questions,
      tracking: seed.tracking,
      contentPlans: seed.contentPlans,
    };

    setState({ data: full, tracking: seed.tracking[0] ?? null });
  }, []);

  if (!state) return null;

  const { data, tracking } = state;

  /*
    The panels, in the order the homepage shows them — the order of the product
    loop the section above them describes: audit, answer, track, and the screen
    that holds it all.

    ⚠️ "answers" is GroupWorkspace, not FaqsWorkspace. FaqsWorkspace is the
    index — a list of pages, where each row links to its answers rather than
    expanding. Captured, it shows two collapsed rows and a search box, which is
    chrome rather than the product. GroupWorkspace is the screen with the
    actual questions and answers on it, which is what the home page is claiming
    to show. It needs a real group id, so it is built here rather than in a
    module constant.

    `data-shot` is the contract with scripts/shots.mjs. Renaming a key here
    means renaming a file there and an import in
    components/marketing/product-shots.tsx.
  */
  const liveGroup = data.groups.find((g) => g.path === '/services') ?? data.groups[0];

  /*
    ⚠️ EVERY PANEL IS WINDOWED TO THE SAME SIZE, AND `offset` IS WHY.

    Captured whole, these screens are between 1,250 and 2,900 CSS pixels tall —
    Results alone came out 2400x5748, a strip nearly two and a half times taller
    than it is wide. Four of those stacked on the home page is a page nobody
    reaches the bottom of, and each one scales down until the type is unreadable.

    So each panel is a fixed 1200x860 window onto its screen, and `offset`
    scrolls the content inside that window to whatever part of it is worth
    showing. Three of the four want the top. Answers is the exception: its top
    is the Generate form, which in a still is an empty textarea — the answers
    themselves are a thousand pixels further down, and they are the thing the
    home page is claiming to show.

    ⚠️ The offsets are measured against the CURRENT layout of these screens. If
    a workspace grows or loses a card near its top, its shot silently re-frames
    onto the wrong thing. Re-run `npm run shots` after any dashboard layout
    change and LOOK at the four files — that is the whole reason this is a
    script and not a folder of hand-taken captures.
  */
  const panels = [
    { key: 'audit', offset: 0, node: <AuditWorkspace /> },
    { key: 'answers', offset: 960, node: <GroupWorkspace groupId={liveGroup.id} /> },
    { key: 'results', offset: 0, node: <TrackingWorkspace /> },
    { key: 'overview', offset: 0, node: <OverviewWorkspace /> },
  ];

  return (
    <DashboardProvider user={SHOT_USER} sites={data.sites} preloaded={{ data, tracking }}>
      {/* bg-cloud matches what AppShell paints behind a workspace, so the
          captured panel sits on the surface it really sits on. */}
      <div className="bg-cloud">
        {/*
          ⚠️ w-300 / h-215 BELOW ARE THE CAPTURE DIMENSIONS. On the default 16px
          root they are exactly 1200×860 CSS pixels, which scripts/shots.mjs
          doubles to the 2400px-wide PNGs the rest of the site's images use.
          They were written as w-[1200px] / h-[860px] until Tailwind pointed out
          the canonical spacing-scale equivalents; the values are identical, but
          the basis is now rem, so anything that changed the root font-size
          would resize every screenshot. Nothing does — the only font-size rules
          in globals.css are print-scoped.
        */}
        {panels.map((panel) => (
          <div
            key={panel.key}
            data-shot={panel.key}
            className="bg-cloud h-215 w-300 overflow-hidden"
          >
            <div className="px-8 pt-8" style={{ marginTop: -panel.offset }}>
              {panel.node}
            </div>
          </div>
        ))}
      </div>
    </DashboardProvider>
  );
}
