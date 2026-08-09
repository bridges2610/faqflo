import type { Metadata } from 'next';
import { ContentWorkspace } from '@/components/dashboard/content-workspace';

export const metadata: Metadata = { title: 'Content' };

export default function ContentPage() {
  return <ContentWorkspace />;
}
