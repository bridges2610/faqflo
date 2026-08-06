import type { Metadata } from 'next';
import { AeoWorkspace } from '@/components/dashboard/aeo-workspace';

export const metadata: Metadata = { title: 'AEO' };

export default function AeoPage() {
  return <AeoWorkspace />;
}
