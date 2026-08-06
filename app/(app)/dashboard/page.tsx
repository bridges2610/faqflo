import type { Metadata } from 'next';
import { OverviewWorkspace } from '@/components/dashboard/overview-workspace';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <OverviewWorkspace />;
}
