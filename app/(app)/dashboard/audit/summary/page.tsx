import type { Metadata } from 'next';
import { AuditSummary } from '@/components/dashboard/audit-summary';

export const metadata: Metadata = { title: 'What this means' };

export default function AuditSummaryPage() {
  return <AuditSummary />;
}
