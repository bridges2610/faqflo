import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { FREE_ARTICLE_CAP, FREE_GENERATED_FAQ_SET_CAP } from '@/lib/dashboard/plans';

/*
  Spending a free account's writing allowance.

  ⚠️ THE SPEND IS CLAIMED, NOT CHECKED THEN WRITTEN. A read, a comparison and an
  update is three steps a second request can slip between: two generations
  arriving together both read 4 of 5, both decide there is room, and both write.
  One statement that only matches while there is room cannot be raced.

  That is the shape welcomeOnce() and claimEvent() in lib/stripe/fulfil.ts both
  use, and their note says why: select-then-check loses to concurrency, only the
  write can arbitrate.

  ⚠️ IT IS NEVER GIVEN BACK. Articles and answers are hard-deleted, and a
  counter that fell when they did would make "one article, ever" mean "one at a
  time, forever". ARTICLE_CAP's own note states the principle — "the model call
  is what cost money, and it already happened".

  ⚠️ CLAIMED BEFORE THE MODEL RUNS, NOT AFTER. A claim that failed after a
  successful generation would hand out work already paid for; a claim that
  succeeds before a generation that then fails costs the customer one unit of a
  small allowance. Neither is free, and the second is the one that does not spend
  our money — so refunds on failure are deliberately NOT implemented. If that
  ever proves too harsh, release the claim on a failed generation rather than
  moving the claim after it.
*/

type Kind = 'article' | 'faq_set';

/* The column each kind spends is chosen inside claim_free_generation() (0021)
   rather than here — a column name crossing the wire would be one more thing a
   caller could get wrong, and the function is the only writer. */

export const FREE_CAP: Record<Kind, number> = {
  article: FREE_ARTICLE_CAP,
  faq_set: FREE_GENERATED_FAQ_SET_CAP,
};

/**
 * The three things that can happen, kept apart on purpose.
 *
 * ⚠️ "REFUSED" AND "BROKE" MUST NOT SHARE A RETURN VALUE, AND THEY DID. This
 * returned null for both, so a route could only say "you are out of allowance"
 * — and when the claim function was a version behind the app it raised
 * `unknown kind faq_set`, which a customer read as "that's the 5 sets your free
 * plan writes". A 500 wearing a 429's clothes is the worst kind of error
 * message: it sends the reader to the pricing page to fix a broken migration.
 */
export type ClaimResult =
  | { ok: true; left: number }
  | { ok: false; reason: 'spent' }
  | { ok: false; reason: 'error' };

/**
 * Take `amount` off a free account's allowance, or refuse.
 *
 * ⚠️ PRO NEVER REACHES THIS. Its budgets are a different shape — monthly, and
 * counted from rows — so a caller must decide by plan before calling. Passing a
 * Pro account here would silently hold it to free's numbers.
 */
export async function claimFreeGeneration(
  userId: string,
  kind: Kind,
  amount: number,
): Promise<ClaimResult> {
  const cap = FREE_CAP[kind];

  if (amount <= 0) return { ok: true, left: cap };

  const db = createAdminClient();

  /*
    ⚠️ AN RPC BECAUSE PostgREST CANNOT EXPRESS `set col = col + n`. A .update()
    can only set a literal, which would force a read-then-write and reopen the
    race this exists to close. claim_free_generation() (0021) does the whole
    thing in one statement whose WHERE clause only matches while there is room.

    It is SECURITY DEFINER and revoked from everyone but service_role, so it is
    reachable only through the admin client — see the note on the REVOKE in that
    migration about why the cap being a parameter is safe.
  */
  const { data, error } = await db.rpc('claim_free_generation', {
    p_user: userId,
    p_kind: kind,
    p_amount: amount,
    p_cap: cap,
  });

  if (error) {
    /* ⚠️ 'error', NOT 'spent'. This fires when the function is missing or a
       version behind the app — "unknown kind faq_set" if 0021 was applied
       before it was revised. Reporting that as a spent allowance is how a
       migration gap gets mistaken for a paywall. */
    console.error(`Could not claim ${kind} allowance for ${userId}:`, error.message);
    return { ok: false, reason: 'error' };
  }

  // NULL from the function means no row matched: nothing was spent.
  return typeof data === 'number' ? { ok: true, left: data } : { ok: false, reason: 'spent' };
}
