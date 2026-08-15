import type { Metadata } from 'next';
import { TrackingWorkspace } from '@/components/dashboard/tracking-workspace';

// "Results", matching the sidebar. The route keeps its /tracking path — labels
// changed when the nav was cut from eight destinations to five, URLs did not,
// and several places deep-link here.
export const metadata: Metadata = { title: 'Results' };

export default function TrackingPage() {
  return <TrackingWorkspace />;
}
