/*
  Leaving the dashboard opens a new tab.

  ⚠️ THE RULE IS "LEAVES THE DASHBOARD", NOT "IS EXTERNAL". Everything under
  /dashboard is the app and navigates in place. Everything else — the blog, the
  guides, the done-for-you page — is reading material somebody dips into and
  comes back from, and losing their place in the app to read a post is the thing
  this prevents.

  ⚠️ `noopener`, NOT `noreferrer`, AND THE DIFFERENCE IS DELIBERATE. The other
  target="_blank" links in this codebase — the cited source URLs on Results and
  the audit — point at somebody else's site and use rel="noreferrer" to avoid
  telling them where the visitor came from. These point at OUR OWN pages, where
  the referrer is how we can tell dashboard traffic apart from cold traffic.
  noopener is the part that actually matters for safety, and modern browsers
  imply it for target="_blank" anyway; it is written out so nobody has to know
  that to read this.
*/
export const NEW_TAB = { target: '_blank', rel: 'noopener' } as const;

/**
 * The words that go with it.
 *
 * ⚠️ A NEW TAB HAS TO ANNOUNCE ITSELF. Sighted readers get the tab appearing as
 * feedback; a screen-reader user gets no signal at all unless the link says so,
 * and "why did Back stop working" is the result. Every NEW_TAB link carries
 * one of these inside its own text, so the note travels with the link rather
 * than sitting near it.
 */
export function NewTabNote() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}
