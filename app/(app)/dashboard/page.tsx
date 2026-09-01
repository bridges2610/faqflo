import type { Metadata } from 'next';
import { FreeHome } from '@/components/dashboard/free-home';
import { OverviewWorkspace } from '@/components/dashboard/overview-workspace';
import { POSTS } from '@/lib/blog/posts';
import { currentUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';

export const metadata: Metadata = { title: 'Dashboard' };

/*
  Two Homes, chosen here.

  Free and Pro land on this route wanting different things. Pro's Home is where
  the weekly email arrives — somebody who already pays, checking what moved.
  Free's is a conversion page: a diagnosis they can re-run three times, and a
  decision to make about whether any of it is real. Those are different arguments in a different order,
  so they are two compositions over the same blocks rather than one screen with
  a branch inside every card.

  ⚠️ THE CHOICE IS MADE SERVER-SIDE, AND THAT IS NOT A PREFERENCE. The obvious
  place is inside the workspace, off useDashboard() — and it would be wrong:
  the provider resolves `user` from the loaded snapshot rather than from the
  prop the layout hands it, so the plan is null for the first frame. isPro(null)
  is false, so every paying customer would get a flash of the free conversion
  page on every single load. Reading the profile row here means the right page
  is the only one ever rendered.

  currentUser() is React cache()-wrapped and the (app) layout already awaited it
  in this request, so this is a second read of the same row rather than a second
  query — the same reasoning start/page.tsx and help/page.tsx state.
*/
export default async function DashboardPage() {
  const user = await currentUser();

  /*
    ⚠️ THE POSTS ARE READ HERE, NOT IN THE WORKSPACE. lib/blog/posts.ts imports
    every .mdx module to reach its `meta`, so a client component importing it
    would pull the whole blog into the dashboard bundle. This is a server
    component, POSTS is already sorted newest first, and only plain objects
    cross the boundary.
  */
  const posts = POSTS.slice(0, 3).map((post) => post.meta);

  return isPro(user) ? <OverviewWorkspace posts={posts} /> : <FreeHome />;
}
