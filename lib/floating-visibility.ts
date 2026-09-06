/*
  When the help button is allowed on screen, and whether it has been put away.

  ⚠️ sessionStorage, NOT localStorage, AND THE DIFFERENCE IS THE WHOLE PROMISE.
  The control says "hide until you sign in again". localStorage would hide it
  until somebody cleared their browser data — which, from the reader's side, is
  indistinguishable from the feature having been removed. sessionStorage keeps
  it hidden across reloads, because a reload is not a sign-in, and lets it go
  when the tab closes.

  ⚠️ IT LIVES IN ITS OWN MODULE BECAUSE TWO FILES HAVE TO AGREE ON THE KEY.
  components/dashboard/help-bubble.tsx writes it and
  components/dashboard/account-menu.tsx clears it on sign-out; a key spelled out
  in both is a key that will be renamed in one.

  ⚠️ EVERY CALL IS WRAPPED. Storage access THROWS rather than returning null in
  Safari with cookies blocked and in some embedded webviews — reading a
  preference is not worth taking the dashboard shell down with it, so a broken
  store reads as "not dismissed" and a failed write simply does not persist.
*/

const KEY_PREFIX = 'faqflo:help-dismissed:';
const SEEN_PREFIX = 'faqflo:help-seen:';

/**
 * How long a new arrival gets before the button appears.
 *
 * ⚠️ IT WAITS BECAUSE THE FIRST TEN SECONDS BELONG TO THE PAGE. Somebody who
 * has just landed is reading their own numbers, and a floating control sliding
 * into the corner during that is an interruption competing with the thing it
 * offers to explain. Arriving afterwards, it reads as an offer rather than a
 * greeting.
 */
export const HELP_REVEAL_DELAY_MS = 10_000;

/* ⚠️ PER USER. Two accounts on one machine — which is every machine a founder
   tests on — must not inherit each other's decision. */
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;
const seenKeyFor = (userId: string) => `${SEEN_PREFIX}${userId}`;

/**
 * Has the button already appeared once in this session?
 *
 * ⚠️ THE WAIT IS PAID ONCE, ON THE FIRST PAGE, NOT ON EVERY PAGE. Without this
 * the delay would restart on each navigation and each reload, so somebody
 * moving briskly between screens would never see the button at all — a control
 * that is permanently ten seconds away is a control that does not exist.
 */
export function hasSeenHelp(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(seenKeyFor(userId)) === '1';
  } catch {
    return false;
  }
}

/** Remember that the wait has been served. */
export function markHelpSeen(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(seenKeyFor(userId), '1');
  } catch {
    /* The button is on screen either way; the only cost is waiting again after
       a reload. Not worth a thrown error inside the dashboard shell. */
  }
}

/** Has this user put the button away in this session? */
export function isHelpDismissed(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(keyFor(userId)) === '1';
  } catch {
    return false;
  }
}

/** Put it away until the next sign-in. */
export function dismissHelp(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(keyFor(userId), '1');
  } catch {
    /* Nothing to do and nothing worth saying: the button stays hidden for as
       long as this component is mounted either way, and it comes back on the
       next load rather than never. */
  }
}

/**
 * Forget every dismissal, and the fact that the button was ever shown.
 *
 * ⚠️ CALLED ON SIGN-OUT, AND WITHOUT IT THE PROMISE BREAKS IN THE ONE CASE
 * SOMEBODY WILL ACTUALLY TEST. sessionStorage survives a sign-out — the tab
 * never closed — so signing out and back in would land on a dashboard with the
 * button still hidden, in a session the reader considers new.
 *
 * It clears every user's key rather than the current one because sign-out is
 * the moment we stop knowing who is asking, and a stale key belonging to
 * somebody who is no longer signed in has no reason to survive.
 */
export function clearHelpDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    const store = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      /* ⚠️ BOTH PREFIXES. Signing in again is a new arrival, so the ten-second
         wait is owed again — leaving the "seen" flag behind would hand the next
         session an instant button and quietly retire the delay. */
      if (key?.startsWith(KEY_PREFIX) || key?.startsWith(SEEN_PREFIX)) keys.push(key);
    }
    /* Collected first, removed after: removing during the walk shifts every
       later index down and skips half of them. */
    for (const key of keys) store.removeItem(key);
  } catch {
    /* See the note at the top — a store that throws is not worth a broken
       sign-out. */
  }
}
