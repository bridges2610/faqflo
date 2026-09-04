import type { Metadata } from 'next';
import { ArticleWorkspace } from '@/components/dashboard/article-workspace';

export const metadata: Metadata = { title: 'Article' };

/*
  One article, at its own URL.

  ⚠️ A STATIC SEGMENT BESIDE A DYNAMIC ONE, WHICH IS FINE AND WORTH KNOWING.
  app/(app)/dashboard/faqs/[groupId] already claims one segment at this depth.
  Next matches static before dynamic, so /dashboard/faqs/article/<id> lands
  here rather than being read as a group called "article"; /dashboard/faqs/article
  on its own is two segments short and harmlessly resolves to the group route,
  which renders its own "that page isn't here" state.
*/
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  /* Pro only — a free account is redirected to its report.
     See the reasoning in lib/auth/pro-only.ts. */
  const { articleId } = await params;

  return <ArticleWorkspace articleId={articleId} />;
}
