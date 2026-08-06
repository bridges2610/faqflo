import type { Metadata } from 'next';
import { FaqsWorkspace } from '@/components/dashboard/faqs-workspace';

export const metadata: Metadata = { title: 'FAQs' };

export default function FaqsPage() {
  return <FaqsWorkspace />;
}
