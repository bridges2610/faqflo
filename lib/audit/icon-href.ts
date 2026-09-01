/**
 * Finding a site's declared icon.
 *
 * Its own module, and pure on purpose: app/api/favicon/route.ts imports
 * `currentUser`, which pulls in `server-only`, so anything living in that file
 * cannot be imported by a test. This is the one piece of real logic behind the
 * favicon proxy, and checking it against a mirrored copy in a test would prove
 * the copy rather than the code.
 */

/**
 * Pull an icon URL out of a page's <head>.
 *
 * ⚠️ A REGEX, AND ONLY BECAUSE THE TARGET IS ONE ATTRIBUTE. Anything that reads
 * structure out of HTML belongs in a parser, but this looks for a single
 * `href` on a single tag and then throws the document away. It also runs on a
 * body that safeFetch already capped, so a hostile page cannot make it chew.
 */
export function iconHref(html: string, base: URL): string | null {
  const links = html.matchAll(/<link\b[^>]*>/gi);
  let best: { href: string; rank: number } | null = null;

  for (const [tag] of links) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/\bicon\b/.test(rel)) continue;

    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(tag)?.[1];
    if (!href) continue;

    /* Prefer a plain icon over an apple-touch one: the Apple asset is a large
       rounded app tile, which looks wrong at 20px beside a domain name. */
    const rank = rel.includes('apple') ? 1 : 0;
    if (!best || rank < best.rank) best = { href, rank };
  }

  if (!best) return null;
  try {
    return new URL(best.href, base).toString();
  } catch {
    return null;
  }
}

