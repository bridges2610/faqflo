import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { TrackingWorkspace } from '@/components/dashboard/tracking-workspace';

// "AI Mentions", matching the sidebar. The route keeps its /tracking path — labels
// changed when the nav was cut from eight destinations to five, URLs did not,
// and several places deep-link here.
export const metadata: Metadata = { title: 'AI Mentions' };

export default async function TrackingPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <TrackingWorkspace />;
}
