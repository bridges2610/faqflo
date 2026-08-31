import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { AuditWorkspace } from '@/components/dashboard/audit-workspace';

export const metadata: Metadata = { title: 'Audit' };

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
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  const { upgraded, view } = await searchParams;

  return (
    <AuditWorkspace
      justUpgraded={upgraded === 'pro'}
      view={view === 'technical' ? 'technical' : 'plain'}
    />
  );
}
