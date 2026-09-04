import type { Metadata } from 'next';
import { AppShell } from '@/components/dashboard/app-shell';
import { ThemeProvider } from '@/components/dashboard/theme';
import { requireUser, sitesForUser } from '@/lib/auth/dal';
import { DashboardProvider } from '@/lib/dashboard/provider';
import { toSite } from '@/lib/dashboard/store';

/*
  The app shell — deliberately not the marketing layout.

  SiteNav and SiteFooter exist to sell the product: sticky marketing links, a
  pricing anchor, a footer full of outbound routes. None of that belongs around
  a screen someone is working in, so the (app) group gets its own chrome.

  It is also where the session is established. proxy.ts has usually redirected
  a signed-out visitor before they reach here, but "usually" is not a security
  property — Next's docs are explicit that a layout cannot stop its segments
  rendering, so this must not be the ONLY check either. It isn't: every route
  handler re-checks through the same DAL.
*/
export const metadata: Metadata = {
  title: 'Dashboard',
  // A signed-in surface has nothing to offer a crawler, and its URLs shouldn't
  // compete with the marketing pages in search results.
  robots: { index: false, follow: false },
};

/*
  Never prerendered.

  Before auth these pages were static — the build output listed /dashboard as
  ○ (Static) — which was harmless when every visitor saw the same seeded demo.
  It is not harmless now: a per-account surface that gets built once and served
  from a cache is how one customer ends up looking at another's sites.

  Reading cookies would mark it dynamic anyway. Saying so explicitly means the
  guarantee doesn't quietly depend on the DAL continuing to be the first thing
  this layout touches.
*/
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  /*
    Two queries, awaited here rather than streamed. The docs warn that a
    top-level await in a layout holds {children} behind it — accepted
    deliberately, because everything below needs to know who is asking, and
    rendering a dashboard shell for nobody while we find out is worse than the
    few milliseconds it costs.
  */
  const user = await requireUser();
  const sites = await sitesForUser(user.id);

  return (
    <DashboardProvider
      user={{
        id: user.id,
        name: user.name ?? user.email,
        email: user.email,
        plan: user.plan,
        planSince: user.plan_since,
        // Anchors the free tier's lifetime check allowance — see
        // trackingPeriod() in lib/dashboard/plans.ts.
        createdAt: user.created_at,
        /* Read-only here by construction: the columns have no UPDATE grant for
           `authenticated`, so the browser can see the spend and not touch it. */
        freeArticlesUsed: user.free_articles_used ?? 0,
        freeFaqSetsUsed: user.free_faq_sets_used ?? 0,
      }}
      sites={sites.map(toSite)}
    >
      {/* ⚠️ THE PROVIDER BELONGS HERE, NOT AROUND THE TOGGLE. It owns the
          <html> theme attribute, and its unmount is what returns a marketing
          page to light — so it has to live exactly as long as the dashboard.
          Mounted inside the account menu instead, its cleanup fired every time
          the menu closed and dark mode reverted on the next click.

          ⚠️ ThemeScript IS NOT HERE. A nested layout renders on the client, and
          a script tag is inert when it does; it lives in app/layout.tsx. */}
      <ThemeProvider>
        <AppShell>{children}</AppShell>
      </ThemeProvider>
    </DashboardProvider>
  );
}
