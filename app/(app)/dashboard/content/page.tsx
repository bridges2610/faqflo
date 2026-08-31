import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { ContentWorkspace } from '@/components/dashboard/content-workspace';

/*
  Off the sidebar, reached from Audit.

  ⚠️ THIS WAS BRIEFLY A REDIRECT TO ANSWERS, AND THAT WAS A MISTAKE. The nav cut
  folded Opportunities into Answers, and this route went with it — but the
  content plan is not a list of unanswered questions, it is advice about the
  customer's WEBSITE for their trade: the pages a roofer needs, the articles
  worth writing. It belongs beside the audit that motivates it.

  The redirect also made the plan ungeneratable: ContentWorkspace holds the only
  button that calls /api/dashboard/content, so with nothing rendering it, no new
  plan could ever exist. Audit shows a plan when there is one and links here
  when there is not.

  Same shape as /dashboard/sites: a real page you reach by link rather than a
  sixth destination to check.
*/
export const metadata: Metadata = { title: 'Pages & topics' };

export default async function ContentPage() {
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  return <ContentWorkspace />;
}
