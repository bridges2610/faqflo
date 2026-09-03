/**
 * The Answers screen's three sections, and how a URL selects one.
 *
 * ⚠️ ITS OWN MODULE BECAUSE THE SERVER READS THE PARAM AND THE CLIENT DRAWS THE
 * TABS. These lived in components/dashboard/workspace-tabs.tsx, which carries
 * `'use client'` — and that directive applies to the whole module, not to the
 * component in it. Every export from a client module is a client reference, so
 * app/(app)/dashboard/faqs/page.tsx calling answersTabFrom() during a server
 * render failed with "attempted to call answersTabFrom() from the server but
 * answersTabFrom is on the client".
 *
 * There is nothing interactive here — a list of hrefs and two pure string
 * functions — so it belongs on the shared side of the boundary, where both
 * halves may import it. WorkspaceTabs itself stays a client component: it reads
 * usePathname().
 *
 * ⚠️ THE PARAM IS READ ON THE SERVER ON PURPOSE. useSearchParams() would opt
 * the whole subtree into a Suspense boundary, and the value is known before the
 * page renders. Same reasoning as the audit's `?view=`.
 */

import type { WorkspaceTab } from '@/components/dashboard/workspace-tabs';

/**
 * Answers, which is where every piece of content is made.
 *
 * Three jobs on one route: pick something to write about, look after the
 * questions and answers, look after the articles. They are tabs rather than
 * three routes because they share one subject — this site's words — and because
 * splitting them is what left the generator stranded on a page nothing linked
 * to.
 *
 * ⚠️ THE BARE URL IS "WRITE ABOUT", AND IT USED TO BE THE ANSWER LIST. The note
 * here previously said the bare URL must stay the answer list because a dozen
 * links point at it meaning exactly that. That was true, and it has been
 * overruled deliberately: landing on a list of what you have already written
 * assumes you know what to write next, while the list of questions nobody has
 * answered is the thing that actually knows.
 *
 * ⚠️ SO EVERY ONE OF THOSE LINKS WAS RE-AIMED IN THE SAME CHANGE, and the
 * failure mode if one is missed is silent — a wrong link still renders a real
 * page, just not the one the sentence promised. The ones that mean "the answer
 * list" now carry ?tab=answers: worklist.ts's blank-answers and add-a-group
 * items, audit-context.ts's two drafts items, home-snapshot's answers tile,
 * the /dashboard/publish redirect, and group-workspace's activeHref. The ones
 * that meant "go and write something" were pointing here all along and are
 * better off for the change.
 */
/* ⚠️ THE ORDER CHANGED BUT THE HREFS DID NOT. Articles now sits before
   Answers, which is the order the work happens in: pick a topic, get an
   article, then add the short answers. `?tab=answers` and `?tab=articles` are
   unchanged, so every link re-aimed when the bare URL moved is still true. */
export const ANSWER_TABS: WorkspaceTab[] = [
  { href: '/dashboard/faqs', label: 'Write about' },
  { href: '/dashboard/faqs?tab=articles', label: 'Articles' },
  { href: '/dashboard/faqs?tab=answers', label: 'Answers' },
];

/** The tab a `?tab=` value selects. Anything unrecognised falls to Write about. */
export type AnswersTab = 'write' | 'answers' | 'articles';

/**
 * ⚠️ `create` IS STILL ACCEPTED, AND DELETING THAT LINE BREAKS REAL LINKS.
 * The first tab was called Create for one release and its URL was
 * ?tab=create. Anything bookmarked or pasted in that window still resolves
 * rather than silently landing somewhere else.
 */
export function answersTabFrom(value: string | undefined): AnswersTab {
  if (value === 'answers' || value === 'articles') return value;
  return 'write';
}

export function answersTabHref(tab: AnswersTab): string {
  return tab === 'write' ? '/dashboard/faqs' : `/dashboard/faqs?tab=${tab}`;
}
