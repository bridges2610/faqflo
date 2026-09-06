/*
  When a floating button is allowed on screen, and whether it has been put away.

  Two of them use this: the dashboard help panel's trigger
  (components/dashboard/help-bubble.tsx) and the public "I'm busy" pitch
  (components/marketing/busy-button.tsx). Both hold back for a moment after
  somebody arrives, both can be dismissed, and both forget the dismissal when
  the visit ends. One module rather than two copies — lib/scan/run.ts:508-515
  records what the copy cost the last time a rule lived in two places and the
  two stopped agreeing.

  ⚠️ sessionStorage, NOT localStorage, AND THE DIFFERENCE IS THE PROMISE. These
  controls go away for the visit, not for good. localStorage would hide them
  until somebody cleared their browser data, which from the reader's side is
  indistinguishable from the feature having been removed — and on the marketing
  side it would retire the pitch permanently for anyone who ever pressed ×.
  sessionStorage survives reloads, because a reload is not a new visit, and
  clears when the tab closes.

  ⚠️ THIS MODULE MUST KEEP ZERO IMPORTS. It is pulled into a client component
  mounted on every marketing page, which is the exact position lib/blog/author.ts
  holds — and that file exists because importing the author from posts.ts put a
  measured 261KB of blog prose into the shared marketing bundle. Nothing here
  may reach for anything.

  ⚠️ EVERY CALL IS WRAPPED. Storage access THROWS rather than returning null in
  Safari with cookies blocked and in some embedded webviews. Reading a
  preference is not worth taking a page down with it, so a broken store reads as
  "not dismissed, not yet seen" and a failed write simply does not persist.
*/

/**
 * How long a signed-in reader gets before the help button appears.
 *
 * ⚠️ IT WAITS BECAUSE THE OPENING MOMENTS BELONG TO THE PAGE. Somebody who has
 * just landed is reading their own numbers, and a floating control sliding into
 * the corner during that is an interruption competing with the thing it offers
 * to explain. Arriving afterwards, it reads as an offer.
 */
export const HELP_REVEAL_DELAY_MS = 15_000;

/**
 * How long a visitor gets before the "I'm busy" pitch appears.
 *
 * ⚠️ A THIRD OF THE DASHBOARD'S WAIT, AND THE TWO SIT TOGETHER SO THE GAP IS
 * VISIBLE. A marketing visitor decides whether to stay in a few seconds, so
 * fifteen would miss most of them; a customer reading their own dashboard is
 * not going anywhere, so a longer wait costs nothing there. Two numbers in two
 * files would drift into being the same number by accident.
 */
export const BUSY_REVEAL_DELAY_MS = 5_000;

/*
  Scopes. `help:<userId>` per account — two people on one machine must not
  inherit each other's decision — and a bare `busy` for the public button, whose
  audience is by definition anonymous.
*/
export const HELP_SCOPE_PREFIX = 'help:';
export const helpScope = (userId: string) => `${HELP_SCOPE_PREFIX}${userId}`;
export const BUSY_SCOPE = 'busy';

const DISMISSED = 'faqflo:floating-dismissed:';
const SEEN = 'faqflo:floating-seen:';

/** Has this button already served its wait in this session? */
export function hasSeenFloating(scope: string): boolean {
  return read(`${SEEN}${scope}`);
}

/**
 * Remember that the wait has been served.
 *
 * ⚠️ THE WAIT IS PAID ONCE PER VISIT, NOT PER PAGE. Without this the delay
 * would restart on every navigation and every reload, so somebody moving
 * briskly between screens would never see the button at all — a control that is
 * permanently five seconds away is a control that does not exist.
 */
export function markFloatingSeen(scope: string): void {
  write(`${SEEN}${scope}`);
}

/** Has this button been put away for the rest of the visit? */
export function isFloatingDismissed(scope: string): boolean {
  return read(`${DISMISSED}${scope}`);
}

/** Put it away until the visit ends. */
export function dismissFloating(scope: string): void {
  write(`${DISMISSED}${scope}`);
}

/**
 * Forget both flags for every scope starting with `prefix`.
 *
 * ⚠️ BY PREFIX, NOT WHOLESALE, AND SIGN-OUT IS WHY. The dashboard clears its own
 * scopes when somebody signs out, because signing back in is a new arrival that
 * is owed the wait again. It has nothing to say about whether a visitor
 * dismissed the public pitch, and re-showing that to somebody who has just left
 * the product would be a strange parting gesture.
 *
 * ⚠️ AND BOTH PREFIXES GO. Clearing the dismissal but leaving "seen" behind
 * would hand the next session an instant button and quietly retire the delay.
 */
export function clearFloating(prefix: string): void {
  if (typeof window === 'undefined') return;
  try {
    const store = window.sessionStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key) continue;
      const scope =
        key.startsWith(DISMISSED) ? key.slice(DISMISSED.length)
        : key.startsWith(SEEN) ? key.slice(SEEN.length)
        : null;
      if (scope !== null && scope.startsWith(prefix)) doomed.push(key);
    }
    /* Collected first, removed after: removing during the walk shifts every
       later index down and skips half of them. */
    for (const key of doomed) store.removeItem(key);
  } catch {
    /* See the note at the top — a store that throws is not worth a broken
       sign-out. */
  }
}

function read(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* The button behaves correctly for as long as it stays mounted either way;
       the only cost is waiting again after a reload. */
  }
}
