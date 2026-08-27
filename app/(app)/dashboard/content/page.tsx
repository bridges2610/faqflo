import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { ContentWorkspace } from '@/components/dashboard/content-workspace';

export const metadata: Metadata = { title: 'Content' };

export default async function ContentPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <ContentWorkspace />;
}
