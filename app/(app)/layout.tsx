import type { Metadata } from 'next';
import { AppShell } from '@/components/dashboard/app-shell';
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
        subscription: user.subscription,
        subscriptionSince: user.subscription_since,
      }}
      sites={sites.map(toSite)}
    >
      <AppShell>{children}</AppShell>
    </DashboardProvider>
  );
}
