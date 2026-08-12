import type { Metadata } from 'next';
import { PostCard } from '@/components/blog/post-card';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { POSTS } from '@/lib/blog/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Notes on getting found by AI answer engines — what changed in search, and what to do about it.',
  alternates: { canonical: '/blog' },
};

export default function Blog() {
  return (
    <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <div className="mx-auto max-w-184">
        <Badge tone="cyan">Blog</Badge>
        <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.75rem]">
          Let&rsquo;s get you found on AI
        </h1>
        <p className="text-slate mt-5 text-lg leading-relaxed">
          What changed in search, what the answer engines actually read, and how small businesses
          can end up in the answer.
        </p>

        {POSTS.length > 0 ? (
          /* One column, per the brief. The hairline between entries does the
             separating so each post needs no card of its own. */
          <div className="divide-line mt-14 divide-y">
            {POSTS.map((post, i) => (
              <div key={post.meta.slug} className="py-10 first:pt-0 last:pb-0">
                {/* Only the first image is eager — it is the one above the fold,
                    and marking them all priority would defeat the point. */}
                <PostCard meta={post.meta} priority={i === 0} />
              </div>
            ))}
          </div>
        ) : (
          /* Deleting the sample posts should leave a page, not a hole. */
          <div className="border-line mt-14 rounded-xl border border-dashed p-10 text-center">
            <h2 className="text-xl">Nothing published yet</h2>
            <p className="text-slate mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
              The first post is on its way. In the meantime, the guide covers the basics of getting
              read by AI.
            </p>
            <ButtonLink href="/seo-guide" size="md" arrow className="mt-6">
              Read the guide
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
