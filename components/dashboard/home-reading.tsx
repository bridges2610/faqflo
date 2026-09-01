'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { PostMeta } from '@/lib/blog/posts';
import { MicroLabel } from './micro-label';
import { NEW_TAB, NewTabNote } from './new-tab';

/*
  The three most recent posts, at the bottom of Home.

  ⚠️ THE METADATA ARRIVES AS A PROP, AND THAT IS NOT A STYLE CHOICE. POSTS in
  lib/blog/posts.ts imports fourteen .mdx modules to read their `meta`, so a
  client component that imported it would pull every blog post into the
  dashboard bundle. The server page reads it and passes plain objects.

  ⚠️ IT REPLACED THE "Learn" CARD, WHICH WAS THE ONLY DASHBOARD LINK TO THE
  GUIDES. That card's own docstring said so. The three newest posts will not
  always include them, so /seo-guide is carried explicitly in the footer line
  below — losing it silently is the failure this section was one edit away from.

  ⚠️ EVERY LINK IN HERE LEAVES THE DASHBOARD, so every one opens a new tab —
  see new-tab.tsx for the rule and why these carry noopener rather than the
  noreferrer the cited-source links use.

  ⚠️ NOTHING IS RESTATED. Title, excerpt, image and alt all come off `meta`.
  PostMeta requires `imageAlt` whenever `image` is set, so a card with a picture
  always has a description and none is ever invented here.
*/
export function HomeReading({ posts }: { posts: PostMeta[] }) {
  if (posts.length === 0) return null;

  return (
    <div className="border-line mt-8 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <MicroLabel>From the blog</MicroLabel>
        <p className="text-slate shrink-0 text-xs">
          <Link href="/blog" {...NEW_TAB} className="text-primary hover:text-primary-hover font-semibold">
            See all posts →
            <NewTabNote />
          </Link>
          <span className="mx-2">·</span>
          <Link href="/seo-guide" {...NEW_TAB} className="text-primary hover:text-primary-hover font-semibold">
            SEO guide
            <NewTabNote />
          </Link>
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {posts.map((post) => (
          <Card hover as="li" key={post.slug} className="overflow-hidden">
            <Link href={`/blog/${post.slug}`} {...NEW_TAB} className="group block">
              {post.image && (
                /* 16:9, so three cards line up whatever each image is. sizes is
                   the real breakpoint set — a third of the content column above
                   sm, the whole of it below. */
                <span className="bg-cloud relative block aspect-[16/9] w-full">
                  <Image
                    src={post.image}
                    alt={post.imageAlt}
                    fill
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="object-cover"
                  />
                </span>
              )}
              <span className="block p-4">
                <span className="text-navy group-hover:text-primary block text-sm leading-snug font-bold transition-colors duration-150">
                  {post.title}
                </span>
                <span className="text-slate mt-1.5 line-clamp-2 block text-xs leading-relaxed">
                  {post.excerpt}
                </span>
                <NewTabNote />
              </span>
            </Link>
          </Card>
        ))}
      </ul>
    </div>
  );
}
