import type { Metadata } from 'next';
import { SitesWorkspace } from '@/components/dashboard/sites-workspace';

export const metadata: Metadata = { title: 'Sites' };

export default function SitesPage() {
  return <SitesWorkspace />;
}
