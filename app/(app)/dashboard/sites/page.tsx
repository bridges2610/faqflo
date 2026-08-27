import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { SitesWorkspace } from '@/components/dashboard/sites-workspace';

export const metadata: Metadata = { title: 'Sites' };

export default async function SitesPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <SitesWorkspace />;
}
