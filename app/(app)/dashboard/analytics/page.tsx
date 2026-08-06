import type { Metadata } from 'next';
import { AnalyticsWorkspace } from '@/components/dashboard/analytics-workspace';

export const metadata: Metadata = { title: 'Analytics' };

export default function AnalyticsPage() {
  return <AnalyticsWorkspace />;
}
