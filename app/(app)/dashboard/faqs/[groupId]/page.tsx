import type { Metadata } from 'next';
import { GroupWorkspace } from '@/components/dashboard/group-workspace';

export const metadata: Metadata = { title: 'Content' };

/*
  One page of the customer's site.

  `params` is awaited, matching app/(marketing)/blog/[slug]/page.tsx. There is
  no generateStaticParams and no dynamicParams: unlike the blog, these ids come
  from a customer's own data, which this server component cannot see — the group
  lives in the browser's store. Resolving the id is therefore the client
  component's job, and it renders a "that page isn't here" state rather than a
  404 when the id no longer matches anything.
*/
export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  const { groupId } = await params;
  return <GroupWorkspace groupId={groupId} />;
}
