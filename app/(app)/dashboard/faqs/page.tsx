import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { FaqsWorkspace } from '@/components/dashboard/faqs-workspace';

export const metadata: Metadata = { title: 'FAQs' };

export default async function FaqsPage() {
  /* Pro only — a free account is redirected to its report.
   See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <FaqsWorkspace />;
}
