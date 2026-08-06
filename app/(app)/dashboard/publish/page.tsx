import type { Metadata } from 'next';
import { PublishWorkspace } from '@/components/dashboard/publish-workspace';

export const metadata: Metadata = { title: 'Publish' };

export default function PublishPage() {
  return <PublishWorkspace />;
}
