import type { Metadata } from 'next';
import { TrackingWorkspace } from '@/components/dashboard/tracking-workspace';

export const metadata: Metadata = { title: 'Tracking' };

export default function TrackingPage() {
  return <TrackingWorkspace />;
}
