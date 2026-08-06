import type { Metadata } from 'next';
import { DiscoverWorkspace } from '@/components/dashboard/discover-workspace';

export const metadata: Metadata = { title: 'Questions' };

export default function QuestionsPage() {
  return <DiscoverWorkspace />;
}
