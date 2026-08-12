import * as whyAiCantRead from '@/content/posts/why-ai-cant-read-your-faqs.mdx';
import * as peopleStoppedClicking from '@/content/posts/people-stopped-clicking.mdx';
import * as faqRichResults from '@/content/posts/faq-rich-results-are-gone.mdx';

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

/** Every post is Beau's today. A per-post override can be added to PostMeta
    later without touching the template. */
export const AUTHOR = 'Beau';

const MODULES = [whyAiCantRead, peopleStoppedClicking, faqRichResults];

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
