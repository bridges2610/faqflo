import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { PublishWorkspace } from '@/components/dashboard/publish-workspace';

export const metadata: Metadata = { title: 'Publish' };

export default async function PublishPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <PublishWorkspace />;
}
