import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { DiscoverWorkspace } from '@/components/dashboard/discover-workspace';

export const metadata: Metadata = { title: 'Questions' };

export default async function QuestionsPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <DiscoverWorkspace />;
}
