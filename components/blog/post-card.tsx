import Link from 'next/link';
import { FeaturedImage } from '@/components/blog/featured-image';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatPostDate, type PostMeta } from '@/lib/blog/posts';

/*
  One tile of the archive.

  The whole card is the link rather than just the title: it is a single
  destination, and a 16:9 image sitting above a headline that goes somewhere
  reads as clickable whether or not it is. The title text gives the link its
  accessible name, so the image needs no duplicate label.

  ⚠️ THIS WAS A FULL-WIDTH ROW, AND THE TYPE SCALE CAME WITH IT. Every entry was
  a 1.75rem headline over a 1.0625rem excerpt across 736px, which reads as a lead
  story — fine when there is one column of them, wrong sixteen times in a grid.
  The sizes below are for a ~350px tile; putting the old ones back would give
  three headlines that wrap to four lines each.

  ⚠️ Card, NOT A BORDER AND A SHADOW WRITTEN OUT HERE. components/ui/card.tsx
  owns the surface, the hairline and the hover lift, and its comment explains why
  the tone is a prop rather than a className — a second copy of that treatment
  would drift from the rest of the site the first time either changed.
*/
export function PostCard({ meta, priority }: { meta: PostMeta; priority?: boolean }) {
  return (
    <Card as="article" hover className="overflow-hidden">
      {/* h-full so tiles in a row end level; the card itself is stretched by the
          grid, and without this the link inside it would not be. */}
      <Link href={`/blog/${meta.slug}`} className="group flex h-full flex-col">
        <FeaturedImage
          meta={meta}
          priority={priority}
          /* The card rounds and clips the top corners; an image rounding itself
             inside that leaves a notch. See the note on this prop. */
          className="rounded-none"
          /* ⚠️ MEASURED OFF THE GRID, NOT THE OLD COLUMN. Three tiles inside
             max-w-6xl is about 22rem each; two is about half the viewport. The
             previous value promised 46rem from 768px up, which had phones
             fetching a crop wide enough for the one-column layout. */
          sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw"
        />

        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-3">
            <time
              dateTime={meta.date}
              className="text-slate font-mono text-xs tracking-wide uppercase"
            >
              {formatPostDate(meta.date)}
            </time>
            {/* Only ever rendered where drafts are visible at all, but it has to
                be here: without it a draft is indistinguishable from a live post
                on localhost. */}
            {meta.draft && <Badge tone="blue">Draft</Badge>}
          </div>

          <h2 className="group-hover:text-primary mt-2 text-[1.125rem] leading-snug text-balance transition-colors duration-150">
            {meta.title}
          </h2>

          {/* ⚠️ CLAMPED, BECAUSE EXCERPTS ARE NOT THE SAME LENGTH. In one column
              a long one simply took another line. In a row of three it made its
              own tile taller than its neighbours, and the row ragged. */}
          <p className="text-slate mt-2 line-clamp-3 text-[0.9375rem] leading-relaxed">
            {meta.excerpt}
          </p>
        </div>
      </Link>
    </Card>
  );
}
