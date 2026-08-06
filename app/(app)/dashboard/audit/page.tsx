import type { Metadata } from 'next';
import { AuditWorkspace } from '@/components/dashboard/audit-workspace';

export const metadata: Metadata = { title: 'Audit' };

export default function AuditPage() {
  return <AuditWorkspace />;
}
