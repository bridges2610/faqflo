import type { Metadata } from 'next';
import { AuditWorkspace } from '@/components/dashboard/audit-workspace';
import { FreeHome } from '@/components/dashboard/free-home';
import { currentUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';

/*
  ⚠️ THE TITLE FOLLOWS THE PLAN, BECAUSE THE SCREEN DOES. A free account reading
  "Audit" in the browser tab while the sidebar says "Your report" is exactly the
  duplication this route was changed to remove.
*/
export async function generateMetadata(): Promise<Metadata> {
  return { title: isPro(await currentUser()) ? 'Audit' : 'Your report' };
}

/*
  Two search params, both read on the server and handed down as props rather
  than pulled from useSearchParams() in the workspace: that hook opts the whole
  subtree into a Suspense boundary, and both values are known before the page
  renders.

  `?upgraded=pro` is set by the checkout return page. The workspace strips it on
  arrival — see the note there about why a refresh must not be able to start a
  second crawl.

  `?view=technical` selects the detailed report. Its absence is the point:
  anything that is not literally "technical" resolves to the plain view, so a
  bare URL, a stale link or a mangled param all land on the reading written for
  a business owner rather than on an error.
*/
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; view?: string }>;
}) {
  const { upgraded, view } = await searchParams;

  /*
    ⚠️ ONE ROUTE, TWO COMPOSITIONS — AND FREE'S IS THE REPORT, NOT A THINNER
    AUDIT. The two screens had grown to say nearly the same thing to a free
    account: one page crawled, a score, and what to do about it. FreeHome is the
    one written for that reader — free-home.tsx calls itself "a conversion page:
    somebody who has had their one check and is deciding
    whether any of this is real" — so it takes the slot rather than being
    reachable only from Home.

    ⚠️ THE CHOICE IS MADE SERVER-SIDE, for the reason app/(app)/dashboard/page.tsx
    states at length: the provider resolves `user` a frame late, so deciding in
    the workspace would flash the wrong screen at every paying customer on every
    load. currentUser() is cache()-wrapped and the layout has already awaited it.
  */
  if (!isPro(await currentUser())) return <FreeHome />;

  return (
    <AuditWorkspace
      justUpgraded={upgraded === 'pro'}
      view={view === 'technical' ? 'technical' : 'plain'}
    />
  );
}
