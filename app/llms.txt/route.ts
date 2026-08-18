import { POSTS } from '@/lib/blog/posts';
import { SITE_URL } from '@/lib/site';

/*
  /llms.txt for faqflo.com.

  ⚠️ WE GENERATE THIS FOR CUSTOMERS AND DID NOT SERVE ONE. buildLlmsTxt() in
  lib/dashboard/export.ts writes an llms.txt for every paying site, the Publish
  page hands it over with instructions, and our own `llms-txt` audit check warns
  a site that has none. FaqFlo's own domain had none.

  ⚠️ HAND-WRITTEN RATHER THAN buildLlmsTxt(). That function takes a Site row, a
  list of FaqGroups and their answers — the shape a customer's dashboard
  produces. FaqFlo's marketing site is not a row in its own database, and
  inventing one to satisfy a signature would be worse than writing the file it
  would have produced. The FORMAT is the same, which is the part that matters:
  an H1 name, a one-line summary, sections of links, a source URL.

  Kept short on purpose. llms.txt is a map for a model deciding what to read
  next, not a copy of the site.
*/

export const dynamic = 'force-static';

export function GET(): Response {
  const posts = POSTS.map((post) => `- [${post.meta.title}](${SITE_URL}/blog/${post.meta.slug}): ${post.meta.excerpt}`);

  const body = [
    '# FaqFlo',
    '',
    '> FaqFlo checks whether AI assistants can read a business website, helps publish answers those assistants can quote, and tracks whether ChatGPT, Perplexity and Gemini start citing it.',
    '',
    '## What it does',
    '',
    '- Audits a site for whether AI answer engines can read it at all — server-rendered content, crawler access, structured data.',
    '- Finds the questions people actually ask assistants about a business like yours.',
    '- Generates answers, schema markup and an llms.txt to paste onto your own domain, so citations credit you rather than a third-party widget.',
    '- Checks ChatGPT, Perplexity and Gemini over time to see whether you are being cited, and who is cited instead.',
    '',
    /*
      ⚠️ Google AI Overviews is deliberately absent from that list. It has no
      API, so we cannot query it — and the Help page says plainly that listing
      it and reporting a permanent zero would read as "you are never cited
      there" when the truth is "we never looked". A file addressed to language
      models is the last place to start overclaiming.
    */
    '## Pages',
    '',
    `- [Home](${SITE_URL}/): free visibility check, pricing, and how it works.`,
    `- [SEO in the age of AI answers](${SITE_URL}/seo-guide): what still matters from classic SEO and what AEO changes.`,
    `- [Done for you](${SITE_URL}/done-for-you): a hands-on setup service — the audit worked, answers written and published to your site, and 30 days of tracking reported back.`,
    `- [About](${SITE_URL}/about): why FaqFlo exists and who builds it.`,
    `- [Blog](${SITE_URL}/blog): notes on getting found by AI answer engines.`,
    '',
    '## Writing',
    '',
    ...posts,
    '',
    '## Source',
    '',
    `${SITE_URL}/`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Static content that changes only on deploy. Long cache, revalidated by
      // the next build.
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
