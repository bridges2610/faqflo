import type { Metadata } from 'next';
import { CompetitorsWorkspace } from '@/components/dashboard/competitors-workspace';

// The one nav destination that is genuinely new rather than relabelled. Every
// other route kept its path when the sidebar was rewritten — see the note on
// NAV in components/dashboard/app-shell.tsx — because a dozen files deep-link
// to them. Nothing linked here before, so there is nothing to preserve.
export const metadata: Metadata = { title: 'Competitors' };

export default async function CompetitorsPage() {
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  return <CompetitorsWorkspace />;
}
