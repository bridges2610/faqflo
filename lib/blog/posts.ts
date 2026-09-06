import * as pickupTime from '@/content/posts/how-long-does-it-take-for-ai-search-to-pick-up-your-content.mdx';
import * as blockingChatgpt from '@/content/posts/is-my-site-blocking-chatgpt.mdx';
import * as elevatorPitch from '@/content/posts/the-60-second-faqflo-elevator-pitch.mdx';
import * as platformRanking from '@/content/posts/ranking-the-best-ai-platforms-for-your-business.mdx';
import * as aiReferral from '@/content/posts/why-getting-your-business-mentioned-by-ai-is-a-great-referral.mdx';
import * as forBusinessOwners from '@/content/posts/faqflo-for-business-owners.mdx';
import * as faqPlugins from '@/content/posts/why-faq-plugins-arent-a-good-idea.mdx';
import * as whatIsAeo from '@/content/posts/what-is-aeo.mdx';
import * as aeoGeoGuide from '@/content/posts/simple-aeo-and-geo-guide-for-business-owners.mdx';
import * as whyCareAboutAi from '@/content/posts/why-business-owners-should-care-about-ai.mdx';
import * as vsPaidAds from '@/content/posts/why-ai-recommendations-are-better-than-paid-ads.mdx';
import * as googleReviews from '@/content/posts/does-ai-use-my-google-reviews-how-reviews-affect-ai-recommendations.mdx';
import * as llmsTxt from '@/content/posts/what-is-llms-txt-and-do-you-actually-need-one.mdx';
import * as preferredSources from '@/content/posts/googles-preferred-sources-button-what-it-is-and-whether-you-need-it.mdx';
import * as addHtml from '@/content/posts/how-to-add-html-to-wordpress-squarespace-webflow-or-wix.mdx';
import * as wrongHours from '@/content/posts/ai-is-telling-customers-the-wrong-hours-about-your-business.mdx';
import * as redditWins from '@/content/posts/reddit-beats-your-website-in-ai-answers-heres-why-that-should-worry-you.mdx';
import * as blockCrawlers from '@/content/posts/should-you-block-ai-crawlers-the-case-for-and-against.mdx';
import * as roofersAeo from '@/content/posts/aeo-for-roofers-how-to-get-more-work-from-ai.mdx';
import * as aeoVsSocial from '@/content/posts/why-aeo-beats-keeping-up-with-social-media.mdx';
import * as faqQuestions from '@/content/posts/what-questions-should-be-on-your-faq-page.mdx';
import * as faqsOnPosts from '@/content/posts/should-i-include-faqs-on-blog-posts.mdx';
import * as beyondYourSite from '@/content/posts/what-else-influences-companies-being-mentioned-in-ai.mdx';
import * as vsSemrush from '@/content/posts/faqflo-vs-semrush-which-one-is-built-for-you.mdx';
import * as dentists from '@/content/posts/how-dentists-can-win-with-ai.mdx';

/*
  The post registry.

  Modules are imported one by one rather than globbed. Turbopack has no
  require.context, but the better reason is that an explicit list fails loudly:
  a post with a broken import breaks the build instead of quietly disappearing
  from the archive, which is the failure mode you would not notice for weeks.

  Adding a post is two lines — a file in content/posts, and its import below.
*/

export type PostMeta = {
  slug: string;
  title: string;
  /** ISO YYYY-MM-DD. Sorted as a string, so no parsing needed to order posts. */
  date: string;
  excerpt: string;
  /** Visible while writing, absent from production entirely. See SHOW_DRAFTS. */
  draft?: boolean;
} & (
  | { image?: undefined; imageAlt?: undefined }
  /* Alt text is required the moment an image is, so a post cannot ship a
     picture with no description. */
  | { image: string; imageAlt: string }
);

export type Post = {
  meta: PostMeta;
  default: (props: Record<string, unknown>) => React.JSX.Element;
};

/*
  Every post is Beau's today. A per-post override can be added to PostMeta later
  without touching the template — until there is a second author, an optional
  meta field would just be scaffolding for someone who doesn't exist.

  ⚠️ THE THREE AUTHOR CONSTANTS MOVED TO ./author AND ARE RE-EXPORTED HERE.
  They are needed by components/marketing/busy-button.tsx, which is a CLIENT
  component on every marketing page — and a value import from this module drags
  all 22 MDX posts into the client bundle with it. Measured: 261KB of post prose
  on every public page, including ones with no blog content at all.

  Re-exported rather than moved-and-forgotten so the byline, the avatar and the
  BlogPosting schema keep their single source: those three strings must never
  describe two different people. Import them from './author' in anything that
  might run on the client; from here is fine on the server.
*/
export { AUTHOR, AUTHOR_AVATAR, AUTHOR_BIO } from './author';

/* Order matters only for posts sharing a date: the sort below is stable, so
   same-day posts keep the order they appear in here. */
const MODULES = [
  /* ⚠️ TWO POSTS SHARE 2026-09-06, so this order decides which leads the
     archive — the sort below is stable and same-day posts keep the order here. */
  dentists,
  vsSemrush,
  /* ⚠️ FOUR POSTS SHARE 2026-09-05, so this order decides which leads the
     archive — the sort below is stable and same-day posts keep the order here. */
  beyondYourSite,
  faqsOnPosts,
  faqQuestions,
  aeoVsSocial,
  roofersAeo,
  /* ⚠️ THREE POSTS SHARE 2026-09-03, SO THIS ORDER IS WHAT DECIDES. Per the
     note above, the sort is stable and same-day posts keep the order they have
     here — newest first. */
  blockCrawlers,
  redditWins,
  wrongHours,
  addHtml,
  preferredSources,
  llmsTxt,
  googleReviews,
  vsPaidAds,
  whyCareAboutAi,
  aeoGeoGuide,
  pickupTime,
  blockingChatgpt,
  elevatorPitch,
  platformRanking,
  aiReferral,
  forBusinessOwners,
  faqPlugins,
  whatIsAeo,
];

/*
  Why a runtime check when PostMeta is a type.

  tsc does not parse the inside of an .mdx file, so `export const meta = {…}`
  in a post is never type-checked — types/mdx.d.ts asserts its shape to
  consumers on trust. This is where that trust is actually verified.

  Throwing is the point. The registry is imported by prerendered pages, so a
  malformed post fails `next build` rather than shipping a page with a blank
  date or an image no screen reader can describe. Same build-time guarantee the
  .tsx posts had from `satisfies`, just enforced a step later.
*/
function validate(meta: PostMeta, index: number): PostMeta {
  const where = meta?.slug ? `post "${meta.slug}"` : `post at index ${index} in MODULES`;

  for (const field of ['slug', 'title', 'date', 'excerpt'] as const) {
    if (typeof meta?.[field] !== 'string' || meta[field].trim() === '') {
      throw new Error(`Blog: ${where} is missing a non-empty "${field}" in its exported meta.`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
    throw new Error(`Blog: ${where} has date "${meta.date}" — expected ISO YYYY-MM-DD.`);
  }

  if (meta.image && !meta.imageAlt) {
    throw new Error(`Blog: ${where} sets an image but no imageAlt. Describe the image.`);
  }

  return meta;
}

const ALL: Post[] = MODULES.map((mod, i) => {
  validate(mod.meta, i);
  return mod as Post;
});

const duplicate = ALL.map((p) => p.meta.slug).find((slug, i, all) => all.indexOf(slug) !== i);
if (duplicate) {
  throw new Error(`Blog: two posts share the slug "${duplicate}". Slugs are the URL, so they must be unique.`);
}

/*
  Drafts show where you're working and hide where customers are.

  NODE_ENV covers localhost. VERCEL_ENV is the extra: a preview deployment still
  renders drafts, so an unfinished post can be shared on a branch URL, while the
  production deployment never builds it at all. Off Vercel that variable is
  undefined and this collapses to the NODE_ENV check.

  Filtering here rather than in each page is what makes it airtight: the
  archive, getPost() and generateStaticParams all read POSTS, so a draft never
  gets a route in production, and dynamicParams = false turns a guessed URL
  into a 404 rather than a render.
*/
const SHOW_DRAFTS = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';

/** Newest first, drafts included only where they should be. */
export const POSTS: Post[] = ALL.filter((post) => SHOW_DRAFTS || !post.meta.draft).sort((a, b) =>
  b.meta.date.localeCompare(a.meta.date),
);

export function getPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.meta.slug === slug);
}

/*
  Both the locale and the timezone are pinned, and neither is optional.

  '2026-08-10' parses as UTC midnight. Formatted in a browser at UTC-5 without
  timeZone: 'UTC', that renders as August 9 — and since the server is on UTC,
  the two disagree and React reports a hydration mismatch. Leaving the locale
  to the runtime causes the same split a subtler way: 'August 10, 2026' on the
  server, '10 August 2026' in a British browser.

  lib/dashboard/format.ts documents the relative-time version of this hazard;
  this is the absolute-date one.
*/
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatPostDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
