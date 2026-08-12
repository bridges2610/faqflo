import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FeaturedImage } from '@/components/blog/featured-image';
import { FinalCta } from '@/components/marketing/final-cta';
import { Badge } from '@/components/ui/badge';
import { AUTHOR, formatPostDate, getPost, POSTS } from '@/lib/blog/posts';

/*
  The single-post template.

  Every post is prerendered at build time from the registry, and dynamicParams
  is off so a URL that isn't a real post 404s statically rather than trying to
  render one that doesn't exist.
*/

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.meta.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) return {};

  const { meta } = post;

  return {
    title: meta.title,
    description: meta.excerpt,
    alternates: { canonical: `/blog/${meta.slug}` },
    openGraph: {
      type: 'article',
      title: meta.title,
      description: meta.excerpt,
      publishedTime: meta.date,
      authors: [AUTHOR],
      ...(meta.image ? { images: [meta.image] } : {}),
    },
  };
}

export default async function Post({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) notFound();

  const { meta, default: Body } = post;

  return (
    <>
      <div className="px-5 pt-10 pb-20 sm:px-8 sm:pt-14">
        <article className="mx-auto max-w-184">
          <Link
            href="/blog"
            className="text-slate hover:text-primary group inline-flex items-center gap-1.5 text-sm transition-colors duration-150"
          >
            <span
              className="transition-transform duration-200 group-hover:-translate-x-1"
              aria-hidden="true"
            >
              ←
            </span>
            All posts
          </Link>

          <div className="mt-6">
            <FeaturedImage meta={meta} priority sizes="(min-width: 768px) 46rem, 100vw" />
          </div>

          {/* Date and byline sit above the headline: they frame it rather than
              trailing it, and it keeps the h1 adjacent to the body copy. */}
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
            <time
              dateTime={meta.date}
              className="text-slate font-mono text-xs tracking-wide uppercase"
            >
              {formatPostDate(meta.date)}
            </time>
            <span className="bg-line h-4 w-px" aria-hidden="true" />
            <span className="flex items-center gap-2">
              <span
                className="bg-primary-soft text-primary font-display flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold"
                aria-hidden="true"
              >
                {AUTHOR.charAt(0)}
              </span>
              <span className="text-navy text-sm font-semibold">{AUTHOR}</span>
            </span>
            {/* So a preview is unmistakably a preview. Never reaches
                production — a draft has no route there. */}
            {meta.draft && <Badge tone="blue">Draft</Badge>}
          </div>

          <h1 className="mt-5 text-[2.125rem] leading-tight text-balance sm:text-[2.5rem]">
            {meta.title}
          </h1>

          <div className="border-line mt-8 border-t pt-8">
            <Body />
          </div>

          {/* The page argues for machine-readable content, so it carries the
              markup for its own. Hand-serialised, matching site-faq.tsx. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: meta.title,
                description: meta.excerpt,
                datePublished: meta.date,
                author: { '@type': 'Person', name: AUTHOR },
                publisher: { '@type': 'Organization', name: 'FaqFlo' },
                mainEntityOfPage: `https://www.faqflo.com/blog/${meta.slug}`,
                ...(meta.image ? { image: `https://www.faqflo.com${meta.image}` } : {}),
              }),
            }}
          />
        </article>
      </div>

      <FinalCta />
    </>
  );
}
