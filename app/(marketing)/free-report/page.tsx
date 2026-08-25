import type { Metadata } from 'next';
import { VisibilityAudit } from '@/components/marketing/visibility-audit';

/*
  The free report, on a URL of its own.

  This used to be a band on the home page, directly under the hero. The hero
  now starts a real check itself — it takes a domain and hands it to
  /dashboard/start, which makes a free account and scans the site — so the
  no-signup version no longer belongs in the same scroll: two forms asking for
  the same thing, four hundred pixels apart, with different outcomes.

  Its own URL is also what it always wanted to be. It is the first of the free
  tools, it is what a dozen blog posts link to, and a thing people are told to
  "run" reads oddly as a section of a page they have to scroll to find.

  ⚠️ THE HEADING IS AN <h1> HERE, INSIDE VisibilityAudit. It was an <h2> when
  this was one band among ten on the home page. Rendering it on a page of its
  own with no h1 above it would leave the document with no top-level heading at
  all. If this component is ever put back inside another page, that has to
  change back.
*/
export const metadata: Metadata = {
  title: 'Free AI visibility report',
  description:
    'See what AI sees on your site. We fetch your page the way an AI crawler does — no JavaScript — and tell you what it can and cannot read. Free, no signup.',
  alternates: { canonical: '/free-report' },
};

export default function FreeReportPage() {
  return <VisibilityAudit />;
}
