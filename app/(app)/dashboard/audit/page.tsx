import type { Metadata } from 'next';
import { AuditWorkspace } from '@/components/dashboard/audit-workspace';

export const metadata: Metadata = { title: 'Audit' };

/*
  `?purchased=get_cited` is set by the checkout return page and read here.

  Read on the server and handed down as a prop rather than pulled from
  useSearchParams() in the workspace: that hook opts the whole subtree into a
  Suspense boundary, and this is one boolean that is known before the page
  renders. The workspace strips the param on arrival — see the note there about
  why a refresh must not be able to start a second crawl.
*/
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const { purchased } = await searchParams;

  return <AuditWorkspace justPurchased={purchased === 'get_cited'} />;
}
