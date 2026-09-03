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
          the tilt, white type — but filled with bg-navy rather than that chip's
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

          ⚠️ AND BELOW sm IT CANNOT HUG, SO THE TILT COMES OFF. text-balance
          evens the two lines but does not shrink the box: an inline-block that
          has to wrap takes the full available width, measured at 100.4% of the
          column at every size from 1.25rem up. So on a phone this is a band,
          not a chip — and a band the exact width of the column has no room to
          rotate. tilt-a swung the corners past both gutters (281.6px inside a
          280px column at 320px wide), which is the clipping free-home.tsx's
          chip comment says the padding exists to prevent. Craft at 600px reads
          as a printing error at 280px.

          The tilt is therefore sm-and-up, and it is written as
          `sm:rotate-[-1.1deg]` rather than tilt-a because that utility is a
          plain class in a layer, not an `@utility` — `sm:tilt-a` would generate
          nothing. Same -1.1° from the same comment, via v4's `rotate` property.

          1.5rem rather than 1.75rem for the same reason: once it is a band, the
          only thing left to tune is how much of the phone it eats. 77px tall
          instead of 91px.
        */}
        {/* ⚠️ THE WRAPPER IS NOT DECORATION. An inline-block h1 joins the
            inline flow of whatever precedes it — without this div the chip sat
            on the Badge's own line at 1280px, to its right, and only looked
            correct on mobile because there was no room for both. The block box
            is what puts the headline back on a line of its own. */}
        <div className="mt-5">
          <h1 className="bg-navy inline-block rounded-[10px] px-4 py-2.5 text-[1.5rem] tracking-tight text-balance text-white sm:rotate-[-1.1deg] sm:px-6 sm:py-3 sm:text-[2.5rem]">
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
            <ButtonLink href="/seo-guide" size="md" shape="pill" arrow className="mt-6">
              Read the guide
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
