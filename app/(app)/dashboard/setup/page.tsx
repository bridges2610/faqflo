import type { Metadata } from 'next';
import { SetupWorkspace } from '@/components/dashboard/setup-workspace';

export const metadata: Metadata = { title: 'Setup' };

export default function SetupPage() {
  return <SetupWorkspace />;
}
