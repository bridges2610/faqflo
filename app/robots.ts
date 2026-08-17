import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/*
  robots.txt.

  ⚠️ WE DID NOT HAVE ONE, AND WE SELL THIS EXACT FILE AS A FIX.

  lib/audit/actions.ts ships a recipe called `unblock-crawlers`, marked
  critical, that hands customers a copy-paste block naming these four agents and
  tells them it takes two minutes. A second recipe, `sitemap`, gives them the
  Sitemap: line. FaqFlo's own domain shipped neither.

  ⚠️ THE FOUR AGENTS ARE NAMED EXPLICITLY EVEN THOUGH `Allow: /` ALREADY COVERS
  THEM. Our own `crawlers` check parses robots.txt and asks, per agent, whether
  it is blocked — a missing file passes by default. Naming them is not about
  passing that check; it is so a person reading this file can see the stance was
  decided rather than defaulted, and so a future blanket Disallow can't quietly
  take the AI crawlers out with it.

  ⚠️ robots.txt is not a security boundary and is not doing the de-indexing
  here. /dashboard and the auth pages carry `robots: { index: false }` in their
  layout metadata, which is what actually keeps them out of an index — a
  Disallow only stops the fetch, and a page that is linked can still be listed
  without being crawled. The Disallow below is a courtesy to save crawl budget
  on pages that need a session anyway.
*/

const AI_AGENTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing here rewards a crawl: both require a session, and /api has no
        // HTML at all.
        disallow: ['/dashboard/', '/api/'],
      },
      ...AI_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: ['/dashboard/', '/api/'],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
