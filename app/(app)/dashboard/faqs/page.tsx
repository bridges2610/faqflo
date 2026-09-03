import type { Metadata } from 'next';
import { requirePro } from '@/lib/auth/pro-only';
import { AnswersWorkspace } from '@/components/dashboard/answers-workspace';
import { answersTabFrom } from '@/lib/dashboard/answers-tabs';

export const metadata: Metadata = { title: 'Content' };

/*
  `?tab=` selects one of the three sections, and it is read on the server and
  handed down as a prop rather than pulled from useSearchParams() in the
  workspace — that hook opts the whole subtree into a Suspense boundary, and the
  value is known before the page renders. Same reasoning as the audit's
  `?view=`, next door.

  ⚠️ THE BARE URL IS THE ANSWER LIST, NOT THE FIRST TAB. answersTabFrom()
  resolves anything unrecognised to 'answers', which is what a dozen existing
  links to /dashboard/faqs mean — see the note on ANSWER_TABS.
*/
export default async function AnswersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  await requirePro();

  const { tab } = await searchParams;

  return <AnswersWorkspace tab={answersTabFrom(tab)} />;
}
