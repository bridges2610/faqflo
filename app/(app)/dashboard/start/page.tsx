import type { Metadata } from 'next';
import { PageHeader } from '@/components/dashboard/page-header';
import { ScanStart } from '@/components/dashboard/scan-start';

export const metadata: Metadata = { title: 'Setting up' };

/*
  Where a customer lands after paying.

  ⚠️ THIS REPLACED A REDIRECT TO /dashboard/audit?purchased=get_cited, which
  auto-ran a full audit from a useEffect. That arrangement filled in exactly one
  of four sections and left the other three empty until the customer found three
  more buttons — a staged signup confirmed it. The audit now runs as the first
  stage of a server-side job, so this page watches rather than works.
*/
export default function StartPage() {
  return (
    <>
      <PageHeader
        title="Setting up your dashboard"
        description="We're reading your site and asking the AI engines about you."
      />
      <ScanStart />
    </>
  );
}
