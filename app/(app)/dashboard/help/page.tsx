import type { Metadata } from 'next';
import { HelpWorkspace } from '@/components/dashboard/help-workspace';
import { currentUser } from '@/lib/auth/dal';
import { canOfferDoneForYou } from '@/lib/auth/entitlements';

export const metadata: Metadata = { title: 'Help' };

/*
  Async to greet the reader by name, and to decide whether the done-for-you
  offer renders at the foot of the page.

  ⚠️ The name comes from currentUser(), NOT from the dashboard store. The store
  coalesces a missing name to the email address (see app/(app)/layout.tsx), and
  "Hey, beau@example.com" is worse than no greeting. The raw profile column is
  null when we genuinely don't know, which is the distinction the greeting needs.

  currentUser() is React cache()-wrapped and the layout already awaited it, so
  this costs no extra query.
*/
export default async function HelpPage() {
  const user = await currentUser();

  /* The decision is made here rather than handed down as a user object.
     HelpWorkspace takes a name and nothing else, which is a shape that file
     chose deliberately, and a resolved boolean keeps it that narrow. */
  return <HelpWorkspace name={user?.name ?? null} pro={canOfferDoneForYou(user)} />;
}
