/**
 * Where this site canonically lives, and how to embed JSON-LD safely.
 *
 * ⚠️ ONE DEFINITION, BECAUSE THERE WERE THREE. The production origin was
 * hardcoded in app/layout.tsx's metadataBase, in lib/email/templates.ts, and
 * four times inside the BlogPosting schema on the blog template. A sitemap
 * would have made it the fourth file. Three copies of a domain is three chances
 * to rename one of them.
 *
 * ⚠️ DELIBERATELY NOT `process.env.NEXT_PUBLIC_SITE_URL`.
 *
 * That variable exists for auth redirects and email links, and .env.example
 * instructs setting it on Production only, leaving it unset on Preview so a
 * preview deployment links to itself. That is exactly right for a confirmation
 * email and exactly wrong for a canonical URL: every preview would then declare
 * itself the canonical copy of every page and compete with production in
 * search. Canonicals, sitemaps and OG URLs must name the real site from a
 * constant, whatever host is serving the response.
 */
export const SITE_URL = 'https://www.faqflo.com';

/** Bare host, for schema and copy that wants it without the scheme. */
export const SITE_HOST = 'www.faqflo.com';

export const SITE_NAME = 'FaqFlo';

/**
 * Serialise a JSON-LD object for embedding in a <script> tag.
 *
 * ⚠️ THE ESCAPE IS THE ENTIRE POINT, AND FOUR OF OUR FIVE BLOCKS LACKED IT.
 *
 * `JSON.stringify` happily emits the characters `</script>` inside a string
 * value. Dropped into dangerouslySetInnerHTML, the browser's HTML parser sees
 * that sequence and closes the script element early — the rest of the JSON
 * spills into the document as text, and any markup in it is parsed as markup.
 * An FAQ answer mentioning a script tag is all it takes.
 *
 * There is a second reason it matters here specifically: our own audit runs a
 * `schema-valid` check that fails a site whose JSON-LD does not parse. Shipping
 * a page that can break its own structured data would mean failing a test we
 * charge customers for.
 *
 * Escaping `<` rather than the full `</script>` sequence is intentional — it is
 * shorter, valid JSON either way, and cannot be defeated by casing or
 * whitespace inside the closing tag.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
