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
        {/*
          ⚠️ THE FREE REPORT'S CHIP, IN THE REPORT'S OWN MASTHEAD COLOUR. The
          shape is free-home.tsx's <Section> h2 — the wordmark's 10px radius,
          tilt-a, white type — but filled with bg-navy rather than that chip's
          bg-primary, which is the same navy free-home's masthead uses. So the
          archive reads as the same product as the report it is selling.

          navy is this palette's black; there is no #000 token and adding one
          would put a colour outside the theme. bg-navy + text-white is 17.04:1
          and one of the two sanctioned white-on-fill pairs (bg-primary is the
          other, at 5.17:1). The gradient is NOT — it takes navy text, never
          white, and must never be swapped in here.

          ⚠️ inline-block IS LOAD-BEARING, AND THE TITLE LENGTH IS PART OF THE
          DESIGN. free-home.tsx states the rule this borrows: the fill hugs the
          text, and a title long enough to wrap stretches it into a band. At
          2.5rem this headline sits on one line inside max-w-184 with room to
          spare — 2.75rem overflows it and wraps. Measure before lengthening.

          Below sm it does wrap to two lines and the chip does fill the column.
          That is accepted here and nowhere else: at 28px this is the page's
          masthead rather than one of five section markers down a report, so a
          filled block reads as deliberate. Anything longer than this title
          makes it three lines, which does not.
        */}
        {/* ⚠️ THE WRAPPER IS NOT DECORATION. An inline-block h1 joins the
            inline flow of whatever precedes it — without this div the chip sat
            on the Badge's own line at 1280px, to its right, and only looked
            correct on mobile because there was no room for both. The block box
            is what puts the headline back on a line of its own. */}
        <div className="mt-5">
          <h1 className="bg-navy tilt-a inline-block rounded-[10px] px-4 py-2.5 text-[1.75rem] tracking-tight text-balance text-white sm:px-6 sm:py-3 sm:text-[2.5rem]">
            Insights to Get You Listed in AI
          </h1>
        </div>
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
